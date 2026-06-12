package com.bizboard.service.ai;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.SystemSetting;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.common.enums.TransactionKind;
import com.bizboard.repository.SystemSettingRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.AuditLogService;
import com.bizboard.service.notification.NotificationDispatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * AI modülü (v1.1): anomali tespiti — alışılmadık gider işlemlerini istatistiksel
 * olarak (ortalama + standart sapma; z-benzeri eşik) flag'ler ve mevcut bildirim
 * altyapısı ({@link NotificationDispatchService}) üzerinden uyarı gönderir.
 *
 * <p><b>YENİ finansal hesap mantığı YOKTUR.</b> Yalnız mevcut gider verisini
 * OKUR; ortalama/sapma sadece "anormal mi" kararı için kullanılır, defter/kasa
 * DEĞİŞMEZ.</p>
 *
 * <p><b>İŞLETME-BAŞINA DEFAULT KAPALI</b> (spam-kaçın). Bir işletme yalnız AI
 * anomali bayrağı ({@code ai.anomaly.enabled:&lt;businessId&gt;} = "true") açıkken
 * taranır. Modülün global bayrağı ({@code app.ai.anomaly.enabled}) de açık olmalı.</p>
 *
 * <p><b>Debounce:</b> aynı işlem ({@code source_id}) için iki kez uyarı gönderilmez
 * — son bildirilen işlem id'leri {@link SystemSetting}'te tutulur.</p>
 *
 * <p><b>Best-effort:</b> bir işletmenin taraması patlasa diğerlerini engellemez;
 * tüm hatalar yakalanır/loglanır (non-fatal).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AnomalyDetectionService {

    /** İşletme-başına AI anomali opt-in bayrağı key prefix'i. */
    public static final String KEY_ANOMALY_ENABLED = "ai.anomaly.enabled";
    /** İşletme-başına son bildirilmiş anomali tx id'leri (debounce) key prefix'i. */
    private static final String KEY_ANOMALY_NOTIFIED = "ai.anomaly.notified";

    private final TransactionRepository transactionRepository;
    private final SystemSettingRepository settingRepository;
    private final UserRepository userRepository;
    private final NotificationDispatchService dispatchService;
    private final AuditLogService auditLogService;
    private final AiProperties props;

    public static String enabledKey(UUID businessId) {
        return KEY_ANOMALY_ENABLED + ":" + businessId;
    }

    private static String notifiedKey(UUID businessId) {
        return KEY_ANOMALY_NOTIFIED + ":" + businessId;
    }

    // ───────────────── opt-in config (admin) ─────────────────

    @Transactional(readOnly = true)
    public boolean isEnabledForBusiness(UUID businessId) {
        return settingRepository.findById(enabledKey(businessId))
                .map(SystemSetting::getValue)
                .map(v -> "true".equalsIgnoreCase(v == null ? "" : v.trim()))
                .orElse(false);
    }

    @Transactional
    public boolean setEnabledForBusiness(UUID businessId, boolean enabled, UUID actorUserId) {
        if (businessId == null) {
            throw new IllegalArgumentException("business_id zorunlu");
        }
        String key = enabledKey(businessId);
        SystemSetting s = settingRepository.findById(key)
                .orElseGet(() -> SystemSetting.builder().key(key).build());
        s.setValue(Boolean.toString(enabled));
        s.setUpdatedBy(actorUserId);
        s.setUpdatedAt(LocalDateTime.now());
        settingRepository.save(s);
        auditLogService.recordEntityAction(
                AuditAction.AI_ANOMALY_CONFIG_UPDATE, actorUserId, "admin",
                "SYSTEM_SETTING", null,
                "AI anomali tespiti " + (enabled ? "açıldı" : "kapatıldı") + " (business=" + businessId + ")",
                Map.of("businessId", businessId.toString(), "enabled", Boolean.toString(enabled)),
                null);
        log.info("[ai-anomaly] opt-in business={} enabled={} by={}", businessId, enabled, actorUserId);
        return enabled;
    }

    // ───────────────── detection ─────────────────

    /**
     * Bir işletmenin son {@code lookbackDays} içindeki gerçek giderlerini tarar,
     * istatistiksel aykırıları (mean + factor*stdev üstü) yeni ise bildirir.
     *
     * @return bu çağrıda gönderilen yeni uyarı sayısı.
     */
    @Transactional
    public int scanBusiness(UUID businessId) {
        if (!props.isEnabled() || !props.getAnomaly().isEnabled()) return 0;
        if (!isEnabledForBusiness(businessId)) return 0;

        try {
            return doScan(businessId);
        } catch (Exception e) {
            log.warn("[ai-anomaly] tarama hatası (business={}): {}", businessId, e.getMessage());
            return 0;
        }
    }

    private int doScan(UUID businessId) {
        AiProperties.Anomaly cfg = props.getAnomaly();
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(cfg.getLookbackDays());

        List<Transaction> all = transactionRepository.findByBusinessIdAndDateBetween(businessId, start, end);

        // Yalnız GERÇEK gider (EXPENSE + NORMAL; TRANSFER/LOAN hariç) — borç/transfer
        // gider değildir (conventions §1). Pozitif tutarlar.
        List<Transaction> expenses = new ArrayList<>();
        for (Transaction t : all) {
            if (t.getDirection() == TransactionDirection.EXPENSE
                    && t.getKind() == TransactionKind.NORMAL
                    && t.getAmount() != null && t.getAmount().signum() > 0) {
                expenses.add(t);
            }
        }
        if (expenses.size() < cfg.getMinSamples()) return 0;

        double mean = expenses.stream().mapToDouble(t -> t.getAmount().doubleValue()).average().orElse(0);
        double variance = expenses.stream()
                .mapToDouble(t -> {
                    double d = t.getAmount().doubleValue() - mean;
                    return d * d;
                }).average().orElse(0);
        double stdev = Math.sqrt(variance);
        if (stdev <= 0) return 0;

        double threshold = mean + cfg.getStdevFactor() * stdev;

        List<UUID> notified = readNotified(businessId);
        List<UUID> admins = adminRecipients();
        if (admins.isEmpty()) return 0;

        int fired = 0;
        for (Transaction t : expenses) {
            double amt = t.getAmount().doubleValue();
            if (amt <= threshold) continue;
            if (notified.contains(t.getId())) continue; // debounce

            double factor = stdev > 0 ? (amt - mean) / stdev : 0;
            dispatchAnomaly(businessId, t, mean, factor, admins);
            notified.add(t.getId());
            fired++;
        }

        if (fired > 0) {
            writeNotified(businessId, notified);
        }
        return fired;
    }

    private void dispatchAnomaly(UUID businessId, Transaction t, double mean, double factor, List<UUID> admins) {
        String businessName = t.getBusiness() != null ? t.getBusiness().getName() : "İşletme";
        String cat = t.getCategory() != null ? t.getCategory().getName() : "kategorisiz";
        String detail = String.format(
                "%s tarihli %s TL gider (kategori: %s) ortalamanın %.1f katı sapma gösteriyor (ort. %s TL).",
                t.getDate(), money(t.getAmount()), cat, factor, money(BigDecimal.valueOf(mean)));

        try {
            dispatchService.dispatch(
                    NotificationEvent.AI_ANOMALY_DETECTED,
                    admins,
                    Map.of("business", businessName, "detail", detail),
                    "/dashboard/ai",
                    businessId);
        } catch (Exception e) {
            log.warn("[ai-anomaly] dispatch hatası: {}", e.getMessage());
        }

        try {
            auditLogService.recordEntityAction(
                    AuditAction.AI_ANOMALY_DETECTED, null, "system",
                    "TRANSACTION", t.getId(), detail,
                    Map.of(
                            "businessId", businessId.toString(),
                            "amount", money(t.getAmount()),
                            "mean", money(BigDecimal.valueOf(mean)),
                            "stdevFactor", String.format("%.2f", factor)),
                    null);
        } catch (Exception e) {
            log.debug("[ai-anomaly] audit yazılamadı: {}", e.getMessage());
        }
        log.info("[ai-anomaly] anomali business={} tx={} tutar={} sapma={}x",
                businessId, t.getId(), money(t.getAmount()), String.format("%.1f", factor));
    }

    private List<UUID> adminRecipients() {
        try {
            List<User> admins = userRepository.findByRoleIgnoreCase("admin");
            List<UUID> ids = new ArrayList<>();
            for (User u : admins) ids.add(u.getId());
            return ids;
        } catch (Exception e) {
            log.warn("[ai-anomaly] admin listesi alınamadı: {}", e.getMessage());
            return List.of();
        }
    }

    // ───────────────── debounce state ─────────────────

    private List<UUID> readNotified(UUID businessId) {
        String raw = settingRepository.findById(notifiedKey(businessId))
                .map(SystemSetting::getValue).orElse(null);
        List<UUID> ids = new ArrayList<>();
        if (raw == null || raw.isBlank()) return ids;
        for (String part : raw.split(",")) {
            String p = part.trim();
            if (p.isEmpty()) continue;
            try {
                ids.add(UUID.fromString(p));
            } catch (IllegalArgumentException ignored) { /* skip corrupt id */ }
        }
        return ids;
    }

    private void writeNotified(UUID businessId, List<UUID> ids) {
        // Listeyi makul tut (son 500) — sınırsız büyümesin.
        List<UUID> bounded = ids.size() > 500 ? ids.subList(ids.size() - 500, ids.size()) : ids;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < bounded.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(bounded.get(i));
        }
        String key = notifiedKey(businessId);
        SystemSetting s = settingRepository.findById(key)
                .orElseGet(() -> SystemSetting.builder().key(key).build());
        s.setValue(sb.toString());
        s.setUpdatedAt(LocalDateTime.now());
        settingRepository.save(s);
    }

    private static String money(BigDecimal v) {
        return (v == null ? BigDecimal.ZERO : v).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }
}
