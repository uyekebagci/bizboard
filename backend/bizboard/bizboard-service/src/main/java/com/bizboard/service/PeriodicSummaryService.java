package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.PeriodSummaryDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.DayClose;
import com.bizboard.common.entity.SystemSetting;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.DayCloseStatus;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.DayCloseRepository;
import com.bizboard.repository.SystemSettingRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.notification.NotificationDispatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Tier 3 (EVT-2): zamanlanmış HAFTALIK + AYLIK finansal özet motoru.
 *
 * <p>İşletme-başına opt-in. Açık olan işletmeler için dönem (önceki hafta /
 * önceki ay) özetini hesaplar ({@link SummaryService} + {@link DayClose} kaçak
 * agregasyonu) ve mevcut kanal-agnostik dispatch altyapısı üzerinden gönderir
 * ({@link NotificationDispatchService}). Kullanıcının "param nerede / kâr-zarar /
 * gider neden arttı" sorularına yönelik içerik: net kâr, gelir/gider, kasa,
 * en yüksek giderler, dönem kaçak toplamı.</p>
 *
 * <p><b>DEFAULT KAPALI (non-breaking, spam-kaçın):</b> işletme-başına
 * {@link SystemSetting} key-value deseni ({@code <prefix>:<businessId>},
 * Tier 2 {@code FinancialAlertService} ve day_open enforce ile aynı). Satır
 * yoksa veya değer {@code false} ise özet GÖNDERİLMEZ. Hiçbir mevcut işletme,
 * admin açıkça açana kadar etkilenmez. NEW_TRANSACTION spam'ine duyarlı
 * kullanıcı için kritik.</p>
 *
 * <p><b>Best-effort:</b> tüm tetikleyici/hesaplama yolları non-fatal — bir
 * işletmenin özeti patlasa diğerleri etkilenmez (izole try/catch). Dispatch
 * katmanı per-event + per-chat tercihlerine ayrıca saygı duyar.</p>
 *
 * <p>Σ tutarlılığı: hesaplama tamamen {@link SummaryService} mantığını yeniden
 * kullanır (TRANSFER/LOAN dışlanır, POS profit semantiği). Yeni bir hesap yolu
 * EKLENMEZ — yalnızca okuma + raporlama.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PeriodicSummaryService {

    /** İşletme-başına haftalık özet açık mı? key prefix ({@code <prefix>:<businessId>}). */
    public static final String KEY_WEEKLY_ENABLED = "summary.weekly_enabled";
    /** İşletme-başına aylık özet açık mı? key prefix ({@code <prefix>:<businessId>}). */
    public static final String KEY_MONTHLY_ENABLED = "summary.monthly_enabled";

    /** Özette listelenecek en yüksek gider kategorisi sayısı (3–5 aralığı). */
    private static final int TOP_EXPENSE_COUNT = 5;

    private final SystemSettingRepository settingRepository;
    private final BusinessRepository businessRepository;
    private final DayCloseRepository dayCloseRepository;
    private final UserRepository userRepository;
    private final com.bizboard.repository.BankAccountRepository bankAccountRepository;
    private final SummaryService summaryService;
    private final NotificationDispatchService dispatchService;
    private final AuditLogService auditLogService;

    // ───────── konfigürasyon (admin) ─────────

    /** İşletme-başına haftalık özet açık/kapalı key'i. */
    public static String weeklyEnabledKey(UUID businessId) {
        return KEY_WEEKLY_ENABLED + ":" + businessId;
    }

    /** İşletme-başına aylık özet açık/kapalı key'i. */
    public static String monthlyEnabledKey(UUID businessId) {
        return KEY_MONTHLY_ENABLED + ":" + businessId;
    }

    /** İşletmenin özet tercihleri (satır yok → ikisi de KAPALI). */
    @Transactional(readOnly = true)
    public SummaryConfig getConfig(UUID businessId) {
        return new SummaryConfig(
                readBool(weeklyEnabledKey(businessId)),
                readBool(monthlyEnabledKey(businessId)));
    }

    /**
     * İşletme özet tercihlerini günceller (audit'li). Her iki periyot bağımsız
     * aç/kapa.
     */
    @Transactional
    public SummaryConfig setConfig(UUID businessId, boolean weeklyEnabled,
                                   boolean monthlyEnabled, UUID actorUserId) {
        if (businessId == null) {
            throw new IllegalArgumentException("business_id zorunlu (per-business özet tercihi)");
        }
        writeBool(weeklyEnabledKey(businessId), weeklyEnabled, actorUserId);
        writeBool(monthlyEnabledKey(businessId), monthlyEnabled, actorUserId);
        auditLogService.recordEntityAction(
                AuditAction.PERIODIC_SUMMARY_CONFIG_UPDATE, actorUserId, "admin",
                "SYSTEM_SETTING", null,
                "Periyodik özet tercihi güncellendi (business=" + businessId
                        + "): haftalık=" + weeklyEnabled + ", aylık=" + monthlyEnabled,
                Map.of(
                        "businessId", businessId.toString(),
                        "weeklyEnabled", String.valueOf(weeklyEnabled),
                        "monthlyEnabled", String.valueOf(monthlyEnabled)));
        log.info("[summary] tercih güncellendi business={} haftalık={} aylık={} by={}",
                businessId, weeklyEnabled, monthlyEnabled, actorUserId);
        return new SummaryConfig(weeklyEnabled, monthlyEnabled);
    }

    // ───────── zamanlanmış tetikleyiciler (scheduler çağırır) ─────────

    /**
     * Haftalık özet: verilen kapalı dönem (Pzt–Pzr) için, haftalık tercihi AÇIK
     * her işletmeye {@link NotificationEvent#WEEKLY_SUMMARY} dispatch eder.
     *
     * @return özet gönderilen işletme sayısı (teşhis/log için)
     */
    @Transactional(readOnly = true)
    public int sendWeeklySummaries(LocalDate periodStart, LocalDate periodEnd) {
        return sendForAll(NotificationEvent.WEEKLY_SUMMARY, "weekly",
                periodStart, periodEnd, this::weeklyEnabledKey0);
    }

    /**
     * Aylık özet: verilen kapalı dönem (ayın 1'i–sonu) için, aylık tercihi AÇIK
     * her işletmeye {@link NotificationEvent#MONTHLY_SUMMARY} dispatch eder.
     *
     * @return özet gönderilen işletme sayısı
     */
    @Transactional(readOnly = true)
    public int sendMonthlySummaries(LocalDate periodStart, LocalDate periodEnd) {
        return sendForAll(NotificationEvent.MONTHLY_SUMMARY, "monthly",
                periodStart, periodEnd, this::monthlyEnabledKey0);
    }

    private String weeklyEnabledKey0(UUID businessId) { return weeklyEnabledKey(businessId); }
    private String monthlyEnabledKey0(UUID businessId) { return monthlyEnabledKey(businessId); }

    private int sendForAll(NotificationEvent event, String periodLabel,
                           LocalDate periodStart, LocalDate periodEnd,
                           java.util.function.Function<UUID, String> keyFn) {
        int sent = 0;
        List<Business> businesses = businessRepository.findAll();
        List<UUID> recipients = adminRecipients(); // alıcı: admin'ler (finansal karar verici)
        if (recipients.isEmpty()) {
            log.debug("[summary] {} — admin alıcı yok, atlandı.", periodLabel);
            return 0;
        }
        for (Business business : businesses) {
            try {
                if (!readBool(keyFn.apply(business.getId()))) {
                    continue; // bu işletme için özet KAPALI (default)
                }
                String body = buildSummaryBody(business, periodStart, periodEnd);
                dispatchService.dispatch(
                        event,
                        recipients,
                        Map.of(
                                "business", business.getName() != null ? business.getName() : "",
                                "period", formatPeriod(periodStart, periodEnd),
                                "summary", body),
                        "/dashboard/reports",
                        business.getId());
                sent++;
                log.info("[summary] {} dispatch business={} dönem={}..{}",
                        periodLabel, business.getId(), periodStart, periodEnd);
            } catch (Exception e) {
                // İzole: bir işletmenin özeti diğerlerini bloklamaz.
                log.warn("[summary] {} hesaplama/dispatch hatası (izole) business={}: {}",
                        periodLabel, business.getId(), e.getMessage());
            }
        }
        log.info("[summary] {} tamamlandı — {}/{} işletmeye gönderildi (dönem {}..{})",
                periodLabel, sent, businesses.size(), periodStart, periodEnd);
        return sent;
    }

    // ───────── içerik (Excel-vari finansal özet) ─────────

    /**
     * İşletme + dönem için çok-satırlı özet gövdesi. İçerik: net kâr, toplam
     * gelir/gider, sabit gider dahil net, en yüksek 3–5 gider kategorisi, dönem
     * kaçak (variance) toplamı. {@link SummaryService} (Σ tutarlı) + {@link DayClose}
     * agregasyonu kullanır.
     */
    @Transactional(readOnly = true)
    public String buildSummaryBody(Business business, LocalDate periodStart, LocalDate periodEnd) {
        UUID businessId = business.getId();
        String currency = business.getCurrency() != null ? business.getCurrency() : "TRY";

        PeriodSummaryDto s = summaryService.getBusinessSummaryForSystem(
                businessId, "custom", periodStart, periodEnd);

        BigDecimal income = nz(s.getTotalIncome());
        BigDecimal expense = nz(s.getTotalExpense());
        BigDecimal net = nz(s.getNetProfit());
        BigDecimal fixed = nz(s.getFixedCostTotal());
        BigDecimal netWithFixed = nz(s.getNetProfitWithFixed());

        StringBuilder sb = new StringBuilder();
        sb.append("Net Kâr: ").append(fmt(net)).append(' ').append(currency).append('\n');
        sb.append("Toplam Gelir: ").append(fmt(income)).append(' ').append(currency).append('\n');
        sb.append("Toplam Gider: ").append(fmt(expense)).append(' ').append(currency).append('\n');
        if (fixed.signum() != 0) {
            sb.append("Sabit Gider (oranlı): ").append(fmt(fixed)).append(' ').append(currency).append('\n');
            sb.append("Net Kâr (sabit dahil): ").append(fmt(netWithFixed)).append(' ').append(currency).append('\n');
        }
        sb.append("İşlem Sayısı: ").append(s.getTransactionCount()).append('\n');

        // Genel kasa durumu (anlık toplam bakiye snapshot — Tier 2 ile aynı tanım).
        BigDecimal cash = bankAccountSum(businessId);
        sb.append("Genel Kasa (güncel): ").append(fmt(cash)).append(' ').append(currency).append('\n');

        // En yüksek 3–5 gider kategorisi.
        List<TopCategory> topExpenses = topExpenseCategories(s.getBreakdownByCategory());
        if (!topExpenses.isEmpty()) {
            sb.append("En Yüksek Giderler:\n");
            for (TopCategory tc : topExpenses) {
                sb.append("  • ").append(tc.name()).append(": ")
                        .append(fmt(tc.amount())).append(' ').append(currency).append('\n');
            }
        }

        // Dönem kaçak/variance toplamı (CLOSED gün kapanışlarından).
        VarianceAgg va = aggregateVariance(businessId, periodStart, periodEnd);
        if (va.closedDays() > 0) {
            sb.append("Dönem Kaçak (").append(va.closedDays()).append(" kapanış): ")
                    .append(fmt(va.total())).append(' ').append(currency);
            if (va.total().signum() > 0) {
                sb.append(" eksik");
            } else if (va.total().signum() < 0) {
                sb.append(" fazla");
            }
            sb.append('\n');
        }

        return sb.toString().trim();
    }

    // ───────── yardımcılar ─────────

    /**
     * İşletme toplam anlık bakiyesi = Σ aktif posting-türetilebilir hesapların
     * snapshot {@code current_balance}'ı (MAIN_CASH/SUB_CASH aggregate çift-sayımı
     * önlemek için dışlanır). Tier 2 {@code FinancialAlertService} ile birebir tanım.
     */
    private BigDecimal bankAccountSum(UUID businessId) {
        var accounts = bankAccountRepository
                .findByActiveTrueAndBusinessIdInOrderByNameAsc(List.of(businessId));
        BigDecimal sum = BigDecimal.ZERO;
        for (var acc : accounts) {
            if (acc.getType() == null || !acc.getType().isPostingDerivable()) continue;
            sum = sum.add(acc.getCurrentBalance() != null ? acc.getCurrentBalance() : BigDecimal.ZERO);
        }
        return sum;
    }

    /** En yüksek gider kategorileri (TRANSFER/LOAN zaten breakdown'da yok). */
    private List<TopCategory> topExpenseCategories(Map<String, Map<String, BigDecimal>> breakdown) {
        List<TopCategory> out = new ArrayList<>();
        if (breakdown == null) return out;
        for (Map.Entry<String, Map<String, BigDecimal>> e : breakdown.entrySet()) {
            BigDecimal exp = e.getValue() != null ? e.getValue().get("expense") : null;
            if (exp != null && exp.signum() > 0) {
                out.add(new TopCategory(e.getKey(), exp));
            }
        }
        out.sort(Comparator.comparing(TopCategory::amount).reversed());
        return out.size() > TOP_EXPENSE_COUNT ? out.subList(0, TOP_EXPENSE_COUNT) : out;
    }

    /**
     * Dönemdeki CLOSED gün kapanışlarının variance (kaçak) toplamı. Pozitif =
     * eksik (kayıp/kaçak), negatif = fazla. PENDING kapanışlar (variance=null)
     * dışlanır.
     */
    private VarianceAgg aggregateVariance(UUID businessId, LocalDate from, LocalDate to) {
        List<DayClose> closes = dayCloseRepository
                .findByBusinessIdAndCloseDateBetweenOrderByCloseDateAsc(businessId, from, to);
        BigDecimal total = BigDecimal.ZERO;
        int closedDays = 0;
        for (DayClose dc : closes) {
            if (dc.getStatus() == DayCloseStatus.CLOSED && dc.getVariance() != null) {
                total = total.add(dc.getVariance());
                closedDays++;
            }
        }
        return new VarianceAgg(total, closedDays);
    }

    /** ADMIN kullanıcı id listesi (Tier 2 FinancialAlertService ile aynı kaynak). */
    private List<UUID> adminRecipients() {
        return userRepository.findByRoleIgnoreCase("admin")
                .stream().map(User::getId).toList();
    }

    private boolean readBool(String key) {
        String raw = settingRepository.findById(key).map(SystemSetting::getValue).orElse(null);
        return "true".equalsIgnoreCase(raw != null ? raw.trim() : null);
    }

    private void writeBool(String key, boolean value, UUID actorUserId) {
        SystemSetting s = settingRepository.findById(key)
                .orElseGet(() -> SystemSetting.builder().key(key).build());
        s.setValue(Boolean.toString(value));
        s.setUpdatedBy(actorUserId);
        s.setUpdatedAt(LocalDateTime.now());
        settingRepository.save(s);
    }

    private static BigDecimal nz(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }

    private static String fmt(BigDecimal v) {
        return nz(v).setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
    }

    private static String formatPeriod(LocalDate from, LocalDate to) {
        return from + " – " + to;
    }

    /** İşletme özet konfigürasyonu (per-business opt-in; default false/false). */
    public record SummaryConfig(boolean weeklyEnabled, boolean monthlyEnabled) {}

    private record TopCategory(String name, BigDecimal amount) {}

    private record VarianceAgg(BigDecimal total, int closedDays) {}
}
