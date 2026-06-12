package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.BudgetThresholdDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Category;
import com.bizboard.common.entity.SystemSetting;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.common.enums.TransactionKind;
import com.bizboard.repository.CategoryRepository;
import com.bizboard.repository.SystemSettingRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.notification.NotificationDispatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Raporlar v1.1 (R7): kategori/dönem bütçe-eşik alarmı.
 *
 * <p><b>READ-ONLY analitik + opt-in alarm.</b> Mevcut ledger/kasa sayılarını
 * DEĞİŞTİRMEZ — yalnızca kategori-başına AYLIK bütçe tanımlar ve gerçekleşen
 * gideri bütçeyle karşılaştırır. {@link FinancialAlertService} ile aynı desen:
 * işletme+kategori-başına {@link SystemSetting} key-value, <b>DEFAULT KAPALI/0</b>
 * (satır yok / ≤0 → bütçe yok, alarm üretilmez — non-breaking, spam-kaçın).</p>
 *
 * <p>Alarm: bir gider tx eklendikten sonra kategorinin mevcut ay gerçekleşeni
 * bütçeyi AŞARSA — yalnız OK→EXCEEDED geçişte (debounce, dönem-scope'lu durum
 * bayrağı) bir kez {@link NotificationEvent#BUDGET_THRESHOLD_EXCEEDED} dispatch.
 * Best-effort: hata tx mutasyonunu BOZMAZ.</p>
 *
 * <p>Multi-tenant: read/list {@code assertCanReadBusiness}; admin config set
 * yalnız {@code /admin/**} (ROLE_ADMIN) üzerinden çağrılır (arch-rules §1).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BudgetThresholdService {

    /** Bütçe tutarı key prefix'i ({@code <prefix>:<businessId>:<categoryId>}). */
    public static final String KEY_BUDGET = "report.budget";
    /** Debounce durum bayrağı key prefix'i ({@code <prefix>:<businessId>:<categoryId>:<periodLabel>}). */
    private static final String KEY_BUDGET_STATE = "report.budget_state";

    private static final String STATE_EXCEEDED = "EXCEEDED";

    private final SystemSettingRepository settingRepository;
    private final TransactionRepository transactionRepository;
    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;
    private final NotificationDispatchService dispatchService;
    private final AuditLogService auditLogService;
    private final BusinessAccessGuard accessGuard;

    // ───────── key helpers ─────────

    public static String budgetKey(UUID businessId, UUID categoryId) {
        return KEY_BUDGET + ":" + businessId + ":" + categoryId;
    }

    private static String stateKey(UUID businessId, UUID categoryId, String periodLabel) {
        return KEY_BUDGET_STATE + ":" + businessId + ":" + categoryId + ":" + periodLabel;
    }

    // ───────── okuma (read guard) ─────────

    /**
     * İşletmenin tüm gider kategorileri + tanımlı bütçeleri + mevcut ay
     * gerçekleşeni. Bütçesi olmayan kategori {@code budget=null} (= kapalı).
     */
    @Transactional(readOnly = true)
    public BudgetThresholdDto getBudgets(UUID userId, UUID businessId) {
        accessGuard.assertCanReadBusiness(userId, businessId);

        YearMonth period = YearMonth.now();
        String periodLabel = period.toString(); // yyyy-MM
        LocalDate from = period.atDay(1);
        LocalDate to = period.atEndOfMonth();

        // mevcut ay gider tx'lerini kategori bazlı topla (NORMAL gerçek gider)
        Map<UUID, BigDecimal> spentByCategory = spentByCategory(businessId, from, to);
        // tanımlı bütçeleri prefix ile çek
        Map<UUID, BigDecimal> budgetByCategory = budgetsForBusiness(businessId);

        List<Category> categories = categoryRepository
                .findByBusinessIdAndActiveTrueOrderBySortOrder(businessId);

        List<BudgetThresholdDto.BudgetRow> rows = new ArrayList<>();
        for (Category c : categories) {
            // Gider tarafıyla ilgili kategoriler (EXPENSE veya BOTH/null) bütçeye konu.
            if (c.getDirection() == TransactionDirection.INCOME) continue;
            BigDecimal budget = budgetByCategory.get(c.getId());
            BigDecimal spent = spentByCategory.getOrDefault(c.getId(), BigDecimal.ZERO);
            BigDecimal usagePct = null;
            boolean exceeded = false;
            if (budget != null && budget.signum() > 0) {
                usagePct = spent.multiply(BigDecimal.valueOf(100))
                        .divide(budget, 0, RoundingMode.HALF_UP);
                exceeded = spent.compareTo(budget) > 0;
            }
            rows.add(BudgetThresholdDto.BudgetRow.builder()
                    .categoryId(c.getId())
                    .categoryName(c.getName())
                    .icon(c.getIcon())
                    .color(c.getColor())
                    .budget(budget)
                    .spent(spent.setScale(2, RoundingMode.HALF_UP))
                    .usagePct(usagePct)
                    .exceeded(exceeded)
                    .build());
        }
        // Bütçesi tanımlı olanlar üste, sonra harcaması yüksek olanlar.
        rows.sort((a, b) -> {
            boolean ab = a.getBudget() != null, bb = b.getBudget() != null;
            if (ab != bb) return ab ? -1 : 1;
            return b.getSpent().compareTo(a.getSpent());
        });

        return BudgetThresholdDto.builder()
                .businessId(businessId)
                .period("MONTHLY")
                .periodLabel(periodLabel)
                .rows(rows)
                .build();
    }

    // ───────── konfigürasyon (admin) ─────────

    /**
     * Kategori bütçesini günceller (audit'li). null/≤0 → bütçe KAPATILIR
     * (satır silinir; durum bayrakları da temizlenir).
     */
    @Transactional
    public void setBudget(UUID businessId, UUID categoryId, BigDecimal budget, UUID actorUserId) {
        if (businessId == null || categoryId == null) {
            throw new IllegalArgumentException("business_id ve category_id zorunlu");
        }
        // kategori bu işletmeye mi ait? (cross-tenant config yazımını engelle)
        Category cat = categoryRepository.findById(categoryId).orElse(null);
        if (cat == null || cat.getBusiness() == null
                || !businessId.equals(cat.getBusiness().getId())) {
            throw new IllegalArgumentException("Kategori bu işletmeye ait değil");
        }

        String key = budgetKey(businessId, categoryId);
        BigDecimal norm = normalize(budget);
        if (norm.signum() <= 0) {
            // KAPAT: bütçe satırı + tüm durum bayraklarını sil.
            if (settingRepository.existsById(key)) settingRepository.deleteById(key);
            clearStates(businessId, categoryId);
        } else {
            SystemSetting s = settingRepository.findById(key)
                    .orElseGet(() -> SystemSetting.builder().key(key).build());
            s.setValue(norm.toPlainString());
            s.setUpdatedBy(actorUserId);
            s.setUpdatedAt(LocalDateTime.now());
            settingRepository.save(s);
        }

        auditLogService.recordEntityAction(
                AuditAction.BUDGET_THRESHOLD_UPDATE, actorUserId, "admin",
                "SYSTEM_SETTING", null,
                "Bütçe eşiği güncellendi (business=" + businessId
                        + ", category=" + categoryId + "): " + norm,
                Map.of(
                        "businessId", businessId.toString(),
                        "categoryId", categoryId.toString(),
                        "budget", norm.toPlainString()),
                null);
        log.info("[budget] eşik güncellendi business={} category={} budget={} by={}",
                businessId, categoryId, norm, actorUserId);
    }

    // ───────── tetikleyici (best-effort, non-fatal) ─────────

    /**
     * BUDGET_THRESHOLD_EXCEEDED: gider tx sonrası kategorinin mevcut ay
     * gerçekleşeni bütçeyi aştıysa — yalnız OK→EXCEEDED geçişte (debounce,
     * dönem-scope'lu) bir kez dispatch. Bütçe 0/null ise no-op (kapalı).
     * Hata tx'i BOZMAZ.
     */
    @Transactional
    public void onExpenseRecorded(Transaction tx, Business business) {
        try {
            if (tx == null || business == null) return;
            if (tx.getDirection() != TransactionDirection.EXPENSE) return;
            TransactionKind kind = tx.getKind() != null ? tx.getKind() : TransactionKind.NORMAL;
            if (kind != TransactionKind.NORMAL) return; // LOAN/TRANSFER gider değil
            if (tx.getCategory() == null) return;       // kategorisiz → bütçe yok

            UUID businessId = business.getId();
            UUID categoryId = tx.getCategory().getId();
            BigDecimal budget = readPositiveAmount(budgetKey(businessId, categoryId));
            if (budget == null) return; // bütçe kapalı

            YearMonth period = YearMonth.now();
            String periodLabel = period.toString();
            LocalDate from = period.atDay(1);
            LocalDate to = period.atEndOfMonth();

            BigDecimal spent = spentByCategory(businessId, from, to)
                    .getOrDefault(categoryId, BigDecimal.ZERO);
            boolean exceeded = spent.compareTo(budget) > 0;
            String prevState = readState(businessId, categoryId, periodLabel);

            if (!exceeded) return; // henüz aşılmadı
            if (STATE_EXCEEDED.equals(prevState)) return; // bu dönem zaten fire etti (debounce)

            writeState(businessId, categoryId, periodLabel);

            String currency = business.getCurrency() != null ? business.getCurrency() : "TRY";
            String categoryName = tx.getCategory().getName() != null
                    ? tx.getCategory().getName() : "—";
            BigDecimal usagePct = spent.multiply(BigDecimal.valueOf(100))
                    .divide(budget, 0, RoundingMode.HALF_UP);

            dispatchService.dispatch(
                    NotificationEvent.BUDGET_THRESHOLD_EXCEEDED,
                    adminRecipients(),
                    Map.of(
                            "business", business.getName() != null ? business.getName() : "",
                            "category", categoryName,
                            "period", periodLabel,
                            "spent", spent.setScale(2, RoundingMode.HALF_UP).toPlainString(),
                            "budget", budget.toPlainString(),
                            "currency", currency,
                            "usagePct", usagePct.toPlainString()),
                    "/dashboard/reports/butce",
                    businessId);
            log.info("[budget] BUDGET_THRESHOLD_EXCEEDED fired business={} category={} spent={} budget={}",
                    businessId, categoryId, spent, budget);
        } catch (Exception e) {
            log.warn("[budget] değerlendirme hatası (izole): {}", e.getMessage());
        }
    }

    // ───────── yardımcılar ─────────

    /** Mevcut ay gider tx'lerini kategori bazlı topla (NORMAL gerçek gider). */
    private Map<UUID, BigDecimal> spentByCategory(UUID businessId, LocalDate from, LocalDate to) {
        List<Transaction> txs = transactionRepository
                .findByBusinessIdAndDateBetween(businessId, from, to);
        Map<UUID, BigDecimal> map = new LinkedHashMap<>();
        for (Transaction t : txs) {
            if (t.getDirection() != TransactionDirection.EXPENSE) continue;
            TransactionKind kind = t.getKind() != null ? t.getKind() : TransactionKind.NORMAL;
            if (kind != TransactionKind.NORMAL) continue;
            if (t.getCategory() == null) continue;
            BigDecimal amt = t.getAmount() != null ? t.getAmount() : BigDecimal.ZERO;
            map.merge(t.getCategory().getId(), amt, BigDecimal::add);
        }
        return map;
    }

    /** İşletmenin tanımlı kategori bütçeleri (key prefix LIKE; ≤0 atlanır). */
    private Map<UUID, BigDecimal> budgetsForBusiness(UUID businessId) {
        String prefix = KEY_BUDGET + ":" + businessId + ":";
        Map<UUID, BigDecimal> map = new LinkedHashMap<>();
        for (SystemSetting s : settingRepository.findByKeyStartingWith(prefix)) {
            String suffix = s.getKey().substring(prefix.length());
            UUID catId;
            try {
                catId = UUID.fromString(suffix);
            } catch (Exception e) {
                continue;
            }
            BigDecimal v = parsePositive(s.getValue());
            if (v != null) map.put(catId, v);
        }
        return map;
    }

    /** ADMIN kullanıcı id listesi (diğer alarmlarla aynı kaynak). */
    private List<UUID> adminRecipients() {
        return userRepository.findByRoleIgnoreCase("admin").stream()
                .map(u -> u.getId()).toList();
    }

    private BigDecimal readPositiveAmount(String key) {
        String raw = settingRepository.findById(key).map(SystemSetting::getValue).orElse(null);
        return parsePositive(raw);
    }

    private static BigDecimal parsePositive(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            BigDecimal v = new BigDecimal(raw.trim());
            return v.signum() > 0 ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String readState(UUID businessId, UUID categoryId, String periodLabel) {
        return settingRepository.findById(stateKey(businessId, categoryId, periodLabel))
                .map(SystemSetting::getValue).orElse(null);
    }

    private void writeState(UUID businessId, UUID categoryId, String periodLabel) {
        String key = stateKey(businessId, categoryId, periodLabel);
        SystemSetting s = settingRepository.findById(key)
                .orElseGet(() -> SystemSetting.builder().key(key).build());
        s.setValue(STATE_EXCEEDED);
        s.setUpdatedAt(LocalDateTime.now());
        settingRepository.save(s);
    }

    /** Bir kategorinin tüm dönem durum bayraklarını sil (bütçe kapatılınca). */
    private void clearStates(UUID businessId, UUID categoryId) {
        String prefix = KEY_BUDGET_STATE + ":" + businessId + ":" + categoryId + ":";
        List<SystemSetting> states = settingRepository.findByKeyStartingWith(prefix);
        if (!states.isEmpty()) settingRepository.deleteAll(states);
    }

    /** null → ZERO; negatif → ZERO (0 = kapalı). */
    private static BigDecimal normalize(BigDecimal v) {
        if (v == null || v.signum() < 0) return BigDecimal.ZERO;
        return v;
    }
}
