package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.SystemSetting;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.common.enums.TransactionKind;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.SystemSettingRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.notification.NotificationDispatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Tier 2 (EVT-1, §2.2 + §2.4): proaktif finansal alarm motoru.
 *
 * <p>İki olayı yönetir:</p>
 * <ul>
 *   <li><b>HIGH_EXPENSE_ALERT</b> — tek bir GERÇEK gider işlemi
 *       ({@code direction=EXPENSE} + {@code kind=NORMAL}; LOAN/TRANSFER hariç)
 *       tutarı işletme-başına {@code high_expense_threshold}'u aştığında anlık
 *       dispatch.</li>
 *   <li><b>BALANCE_BELOW_THRESHOLD</b> — işlem sonrası işletmenin toplam
 *       (posting-türetilebilir aktif hesaplar) bakiyesi {@code balance_alert_threshold}
 *       altına DÜŞTÜĞÜNDE dispatch. <b>DEBOUNCE:</b> yalnız eşiği AŞAĞI geçişte
 *       bir kez fire eder; zaten altındayken her tx'te tekrar etmez; üstüne çıkıp
 *       tekrar düşünce yeni fire (durum bayrağı {@code SystemSetting}'te).</li>
 * </ul>
 *
 * <p><b>Konfigürasyon:</b> işletme-başına {@link SystemSetting} key-value
 * deseni ({@code <key>:<businessId>}, day_open enforce ile aynı). <b>DEFAULT
 * KAPALI/0</b> — satır yoksa ya da değer ≤ 0 ise alarm KAPALIDIR (non-breaking;
 * ayarlanınca aktifleşir). DGR dahil hiçbir işletme, kendi eşiği set edilmedikçe
 * etkilenmez.</p>
 *
 * <p><b>Best-effort:</b> tüm tetikleyici metotlar non-fatal — alarm üretimi tx
 * mutasyonunu BOZMAZ (hata yakalanır, loglanır). Dispatch katmanı zaten
 * per-event + per-chat (CHT-2) tercihlerine saygı duyar; bu servis dispatch
 * iç mantığına DOKUNMAZ.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FinancialAlertService {

    /** İşletme bakiye eşiği key prefix'i ({@code <prefix>:<businessId>}). */
    public static final String KEY_BALANCE_THRESHOLD = "finalert.balance_threshold";
    /** Tek harcama eşiği key prefix'i ({@code <prefix>:<businessId>}). */
    public static final String KEY_HIGH_EXPENSE_THRESHOLD = "finalert.high_expense_threshold";
    /** Bakiye debounce durum bayrağı key prefix'i ({@code <prefix>:<businessId>}). */
    private static final String KEY_BALANCE_STATE = "finalert.balance_state";

    /**
     * #91647f74: Yeni-işlem (NEW_TRANSACTION) bildirimi eşiği key prefix'i
     * ({@code <prefix>:<businessId>}). Bu eşiğin ÜSTÜNDEKİ tutarlı işlemlerde
     * bildirim atılır; spam-kaçın. <b>DEFAULT MAKUL</b> — satır yoksa
     * {@link #DEFAULT_NEW_TX_NOTIFY_THRESHOLD} (10.000) uygulanır. 0 yazılırsa
     * "her işlemde bildir" (eşik kapalı) semantiğindedir.
     */
    public static final String KEY_NEW_TX_NOTIFY_THRESHOLD = "finalert.new_tx_notify_threshold";

    /** Yeni-işlem bildirimi varsayılan eşiği (TL). Spec #91647f74. */
    public static final BigDecimal DEFAULT_NEW_TX_NOTIFY_THRESHOLD = new BigDecimal("10000");

    /** Debounce durum değerleri. */
    private static final String STATE_BELOW = "BELOW";
    private static final String STATE_OK = "OK";

    private final SystemSettingRepository settingRepository;
    private final BankAccountRepository bankAccountRepository;
    private final UserRepository userRepository;
    private final NotificationDispatchService dispatchService;
    private final AuditLogService auditLogService;

    // ───────── konfigürasyon (admin) ─────────

    /** İşletme-başına bakiye eşiği key'i. */
    public static String balanceThresholdKey(UUID businessId) {
        return KEY_BALANCE_THRESHOLD + ":" + businessId;
    }

    /** İşletme-başına tek-harcama eşiği key'i. */
    public static String highExpenseThresholdKey(UUID businessId) {
        return KEY_HIGH_EXPENSE_THRESHOLD + ":" + businessId;
    }

    /** İşletme-başına yeni-işlem bildirim eşiği key'i (#91647f74). */
    public static String newTxNotifyThresholdKey(UUID businessId) {
        return KEY_NEW_TX_NOTIFY_THRESHOLD + ":" + businessId;
    }

    /**
     * #91647f74: Bir işlemin NEW_TRANSACTION bildirimi tetikleyip tetiklemeyeceğine
     * karar verir. İşlem tutarı (mutlak) işletme-başına eşiği AŞARSA true.
     *
     * <p>Eşik semantiği:</p>
     * <ul>
     *   <li>Satır YOK → {@link #DEFAULT_NEW_TX_NOTIFY_THRESHOLD} (10.000) uygulanır
     *       (default-makul, spam-kaçın).</li>
     *   <li>Değer ≤ 0 → eşik KAPALI → her işlemde bildir (true).</li>
     *   <li>Değer &gt; 0 → {@code |amount| > eşik} ise bildir.</li>
     * </ul>
     *
     * <p>Best-effort: parse/okuma hatasında varsayılan eşik uygulanır.</p>
     */
    @Transactional(readOnly = true)
    public boolean shouldNotifyNewTransaction(UUID businessId, BigDecimal amount) {
        BigDecimal threshold = readNewTxNotifyThreshold(businessId);
        // 0 (veya negatif) → eşik kapalı → her işlemde bildir.
        if (threshold == null || threshold.signum() <= 0) return true;
        BigDecimal abs = amount != null ? amount.abs() : BigDecimal.ZERO;
        return abs.compareTo(threshold) > 0;
    }

    /**
     * Etkin yeni-işlem eşiği: ayar varsa onu, yoksa varsayılanı döner. ≤0 yazılmışsa
     * onu (kapalı semantiği) döner. Admin ekranı için.
     */
    @Transactional(readOnly = true)
    public BigDecimal getNewTxNotifyThreshold(UUID businessId) {
        BigDecimal v = readNewTxNotifyThreshold(businessId);
        return v != null ? v : DEFAULT_NEW_TX_NOTIFY_THRESHOLD;
    }

    /**
     * İşletme yeni-işlem bildirim eşiğini günceller (audit'li). null → varsayılana
     * dön (satır silinir). 0 → "her işlemde bildir" olarak saklanır.
     */
    @Transactional
    public BigDecimal setNewTxNotifyThreshold(UUID businessId, BigDecimal threshold, UUID actorUserId) {
        if (businessId == null) {
            throw new IllegalArgumentException("business_id zorunlu (per-business eşik)");
        }
        String key = newTxNotifyThresholdKey(businessId);
        if (threshold == null) {
            // Varsayılana dön — satırı sil.
            if (settingRepository.existsById(key)) settingRepository.deleteById(key);
            log.info("[finalert] yeni-işlem eşiği VARSAYILANA döndü business={} by={}", businessId, actorUserId);
            return DEFAULT_NEW_TX_NOTIFY_THRESHOLD;
        }
        BigDecimal norm = threshold.signum() < 0 ? BigDecimal.ZERO : threshold;
        writeAmountAllowZero(key, norm, actorUserId);
        auditLogService.recordEntityAction(
                AuditAction.FINANCIAL_ALERT_THRESHOLD_UPDATE, actorUserId, "admin",
                "SYSTEM_SETTING", null,
                "Yeni-işlem bildirim eşiği güncellendi (business=" + businessId + "): " + norm,
                Map.of(
                        "businessId", businessId.toString(),
                        "newTxNotifyThreshold", norm.toPlainString()),
                null);
        log.info("[finalert] yeni-işlem eşiği güncellendi business={} eşik={} by={}", businessId, norm, actorUserId);
        return norm;
    }

    /**
     * İşletmenin alarm eşikleri (yapılandırılmamış/0 ise null). null = alarm
     * KAPALI.
     */
    @Transactional(readOnly = true)
    public ThresholdConfig getThresholds(UUID businessId) {
        return new ThresholdConfig(
                readPositiveAmount(balanceThresholdKey(businessId)),
                readPositiveAmount(highExpenseThresholdKey(businessId)));
    }

    /**
     * İşletme eşiklerini günceller (audit'li). null veya ≤0 → eşik KAPATILIR
     * (satır 0 olarak yazılır; okuma 0'ı "kapalı" sayar).
     */
    @Transactional
    public ThresholdConfig setThresholds(UUID businessId,
                                         BigDecimal balanceThreshold,
                                         BigDecimal highExpenseThreshold,
                                         UUID actorUserId) {
        if (businessId == null) {
            throw new IllegalArgumentException("business_id zorunlu (per-business eşik)");
        }
        BigDecimal normBalance = normalize(balanceThreshold);
        BigDecimal normExpense = normalize(highExpenseThreshold);
        writeAmount(balanceThresholdKey(businessId), normBalance, actorUserId);
        writeAmount(highExpenseThresholdKey(businessId), normExpense, actorUserId);
        auditLogService.recordEntityAction(
                AuditAction.FINANCIAL_ALERT_THRESHOLD_UPDATE, actorUserId, "admin",
                "SYSTEM_SETTING", null,
                "Finansal alarm eşikleri güncellendi (business=" + businessId
                        + "): bakiye=" + normBalance + ", harcama=" + normExpense,
                Map.of(
                        "businessId", businessId.toString(),
                        "balanceThreshold", normBalance.toPlainString(),
                        "highExpenseThreshold", normExpense.toPlainString()),
                null);
        log.info("[finalert] eşikler güncellendi business={} bakiye={} harcama={} by={}",
                businessId, normBalance, normExpense, actorUserId);
        // Dönüş değeri "etkin" eşikler (0 → null/kapalı semantiği).
        return new ThresholdConfig(
                normBalance.signum() > 0 ? normBalance : null,
                normExpense.signum() > 0 ? normExpense : null);
    }

    // ───────── tetikleyiciler (best-effort, non-fatal) ─────────

    /**
     * HIGH_EXPENSE_ALERT: yeni gider işlemi tutarı eşiği aştıysa dispatch eder.
     * Yalnız GERÇEK gider: {@code direction=EXPENSE} + {@code kind=NORMAL}
     * (LOAN/TRANSFER bilanço hareketidir — gider değildir, atlanır).
     *
     * <p>Tx create akışından (post-commit semantiğiyle aynı JPA tx içinde) çağrılır.
     * Eşik 0/null ise no-op (alarm kapalı). Hata tx'i BOZMAZ.</p>
     */
    @Transactional
    public void onTransactionCreated(Transaction tx, Business business) {
        try {
            if (tx == null || business == null) return;
            if (tx.getDirection() != TransactionDirection.EXPENSE) return;
            // Sadece gerçek gider — LOAN (borç) ve TRANSFER bilanço hareketi, P&L'e girmez.
            TransactionKind kind = tx.getKind() != null ? tx.getKind() : TransactionKind.NORMAL;
            if (kind != TransactionKind.NORMAL) return;

            BigDecimal threshold = readPositiveAmount(highExpenseThresholdKey(business.getId()));
            if (threshold == null) return; // alarm kapalı
            BigDecimal amount = tx.getAmount() != null ? tx.getAmount() : BigDecimal.ZERO;
            if (amount.compareTo(threshold) <= 0) return; // eşik aşılmadı

            String currency = tx.getCurrency() != null ? tx.getCurrency() : "TRY";
            String category = tx.getCategory() != null && tx.getCategory().getName() != null
                    ? " · " + tx.getCategory().getName() : "";
            String description = tx.getDescription() != null && !tx.getDescription().isBlank()
                    ? " · " + tx.getDescription() : "";

            dispatchService.dispatch(
                    NotificationEvent.HIGH_EXPENSE_ALERT,
                    adminRecipients(),
                    Map.of(
                            "business", business.getName() != null ? business.getName() : "",
                            "amount", amount.toPlainString(),
                            "currency", currency,
                            "category", category,
                            "description", description,
                            "threshold", threshold.toPlainString()),
                    "/dashboard/transactions",
                    business.getId());
            log.info("[finalert] HIGH_EXPENSE_ALERT fired business={} amount={} threshold={}",
                    business.getId(), amount, threshold);
        } catch (Exception e) {
            log.warn("[finalert] HIGH_EXPENSE değerlendirme hatası (izole): {}", e.getMessage());
        }
    }

    /**
     * BALANCE_BELOW_THRESHOLD: işlem sonrası işletme toplam bakiyesini eşikle
     * karşılaştırır; eşiği AŞAĞI yeni geçtiyse (debounce) bir kez dispatch eder.
     *
     * <p>Bakiye = Σ aktif posting-türetilebilir hesapların {@code current_balance}'ı
     * (MAIN_CASH/SUB_CASH aggregate hesapları çift-sayımı önlemek için dışlanır).
     * Eşik 0/null ise no-op (durum bayrağı temizlenir). Hata tx'i BOZMAZ.</p>
     */
    @Transactional
    public void onBalanceChanged(Business business) {
        try {
            if (business == null) return;
            UUID businessId = business.getId();
            BigDecimal threshold = readPositiveAmount(balanceThresholdKey(businessId));
            if (threshold == null) {
                // Alarm kapalı — eski durum bayrağı varsa temizle (yeniden açılınca temiz başlasın).
                clearState(businessId);
                return;
            }

            BigDecimal balance = currentBusinessBalance(businessId);
            boolean isBelow = balance.compareTo(threshold) < 0;
            String prevState = readState(businessId);

            if (isBelow) {
                // DEBOUNCE: yalnız OK→BELOW geçişte fire et. Zaten BELOW ise tekrar etme.
                if (STATE_BELOW.equals(prevState)) return;
                writeState(businessId, STATE_BELOW);
                String currency = business.getCurrency() != null ? business.getCurrency() : "TRY";
                dispatchService.dispatch(
                        NotificationEvent.BALANCE_BELOW_THRESHOLD,
                        adminRecipients(),
                        Map.of(
                                "business", business.getName() != null ? business.getName() : "",
                                "balance", balance.toPlainString(),
                                "currency", currency,
                                "threshold", threshold.toPlainString()),
                        "/dashboard/nakit",
                        businessId);
                log.info("[finalert] BALANCE_BELOW_THRESHOLD fired business={} balance={} threshold={}",
                        businessId, balance, threshold);
            } else {
                // Eşiğin üstüne çıktı → durumu sıfırla ki tekrar düşünce yeni fire olsun.
                if (!STATE_OK.equals(prevState)) {
                    writeState(businessId, STATE_OK);
                }
            }
        } catch (Exception e) {
            log.warn("[finalert] BALANCE değerlendirme hatası (izole): {}", e.getMessage());
        }
    }

    // ───────── yardımcılar ─────────

    /**
     * İşletme toplam bakiyesi = Σ aktif posting-türetilebilir hesapların
     * snapshot {@code current_balance}'ı. MAIN_CASH/SUB_CASH (üye-hesap aggregate)
     * dışlanır — çift-sayım yapılmaz ({@code isPostingDerivable()}).
     */
    private BigDecimal currentBusinessBalance(UUID businessId) {
        List<BankAccount> accounts = bankAccountRepository
                .findByActiveTrueAndBusinessIdInOrderByNameAsc(List.of(businessId));
        BigDecimal sum = BigDecimal.ZERO;
        for (BankAccount acc : accounts) {
            if (acc.getType() == null || !acc.getType().isPostingDerivable()) {
                continue;
            }
            sum = sum.add(acc.getCurrentBalance() != null ? acc.getCurrentBalance() : BigDecimal.ZERO);
        }
        return sum;
    }

    /** ADMIN kullanıcı id listesi (NEW_TRANSACTION dispatch ile aynı kaynak). */
    private List<UUID> adminRecipients() {
        return userRepository.findByRoleIgnoreCase("admin")
                .stream().map(User::getId).toList();
    }

    /**
     * Pozitif tutar oku; satır yok / boş / parse hatası / ≤0 → null (= alarm
     * kapalı). 0 değeri açıkça "kapalı" semantiğindedir.
     */
    private BigDecimal readPositiveAmount(String key) {
        String raw = settingRepository.findById(key).map(SystemSetting::getValue).orElse(null);
        if (raw == null || raw.isBlank()) return null;
        try {
            BigDecimal v = new BigDecimal(raw.trim());
            return v.signum() > 0 ? v : null;
        } catch (NumberFormatException e) {
            log.warn("[finalert] geçersiz eşik değeri key={} value='{}' — yok sayıldı", key, raw);
            return null;
        }
    }

    private void writeAmount(String key, BigDecimal value, UUID actorUserId) {
        SystemSetting s = settingRepository.findById(key)
                .orElseGet(() -> SystemSetting.builder().key(key).build());
        s.setValue(value.toPlainString());
        s.setUpdatedBy(actorUserId);
        s.setUpdatedAt(LocalDateTime.now());
        settingRepository.save(s);
    }

    /** {@link #writeAmount} ile aynı ama 0 da geçerli değer (eşik kapalı semantiği). */
    private void writeAmountAllowZero(String key, BigDecimal value, UUID actorUserId) {
        writeAmount(key, value, actorUserId);
    }

    /**
     * #91647f74: Yeni-işlem eşiğini oku. Satır YOK → null (çağıran varsayılanı
     * uygular). 0/negatif değer → BigDecimal.ZERO (eşik kapalı semantiği — burada
     * {@link #readPositiveAmount}'tan FARKLI: 0'ı null'a düşürmez). Parse hatası →
     * null (varsayılana düş, güvenli taraf).
     */
    private BigDecimal readNewTxNotifyThreshold(UUID businessId) {
        String raw = settingRepository.findById(newTxNotifyThresholdKey(businessId))
                .map(SystemSetting::getValue).orElse(null);
        if (raw == null || raw.isBlank()) return null; // satır yok → varsayılan
        try {
            BigDecimal v = new BigDecimal(raw.trim());
            return v.signum() < 0 ? BigDecimal.ZERO : v;
        } catch (NumberFormatException e) {
            log.warn("[finalert] geçersiz yeni-işlem eşiği business={} value='{}' — varsayılan uygulanır",
                    businessId, raw);
            return null;
        }
    }

    private String readState(UUID businessId) {
        return settingRepository.findById(KEY_BALANCE_STATE + ":" + businessId)
                .map(SystemSetting::getValue).orElse(STATE_OK);
    }

    private void writeState(UUID businessId, String state) {
        String key = KEY_BALANCE_STATE + ":" + businessId;
        SystemSetting s = settingRepository.findById(key)
                .orElseGet(() -> SystemSetting.builder().key(key).build());
        s.setValue(state);
        s.setUpdatedAt(LocalDateTime.now());
        settingRepository.save(s);
    }

    private void clearState(UUID businessId) {
        String key = KEY_BALANCE_STATE + ":" + businessId;
        if (settingRepository.existsById(key)) {
            settingRepository.deleteById(key);
        }
    }

    /** null → ZERO; negatif → ZERO (0 = kapalı). */
    private static BigDecimal normalize(BigDecimal v) {
        if (v == null || v.signum() < 0) return BigDecimal.ZERO;
        return v;
    }

    /** İşletme eşik konfigürasyonu (null = o alarm kapalı). */
    public record ThresholdConfig(BigDecimal balanceThreshold, BigDecimal highExpenseThreshold) {}
}
