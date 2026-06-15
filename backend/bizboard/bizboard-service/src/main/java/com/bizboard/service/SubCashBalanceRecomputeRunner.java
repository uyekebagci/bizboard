package com.bizboard.service;

import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.SubCashTxInclusion;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.common.enums.InclusionScope;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.common.enums.TransactionKind;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.SubCashTxInclusionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Beta v1.1 hotfix: SUB_CASH.current_balance'ları MANUAL inclusion'larından
 * tek-seferlik recompute eder. Geçmişte manuel atama yapılmış ama balance'a
 * yansımayan tx'leri (PER ÖZELLİKLE eski rate snapshot'ları yüzünden eksik
 * yansıyanları) düzeltir.
 *
 * <p>İdempotency: sistem bayrağı tablosu yerine MANUAL inclusion delta'yı
 * her run'da SUB_CASH'e tam tutar olarak yansıtır. Çift çalışmasını engellemek
 * için tek bir flag tablosu (system_flags) kullanılır.</p>
 *
 * <p>SAFEÇ: yalnız MANUAL scope'lu inclusion'lar dahil. AUTOMATIC scope
 * (counterpart/POS/bank assignment match) zaten counterpart/bank tx'lerin
 * doğal akışıyla yansıyor.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(20) // PosExpenseFlow (19) sonrası
public class SubCashBalanceRecomputeRunner implements ApplicationRunner {

    private static final String FLAG_KEY = "subcash_balance_recompute_v1_1_pos_komisyon_drop";

    private final JdbcTemplate jdbc;
    private final SubCashTxInclusionRepository inclusionRepository;
    private final BankAccountRepository bankAccountRepository;

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("CREATE TABLE IF NOT EXISTS system_flags ("
                    + "key VARCHAR(120) PRIMARY KEY, "
                    + "set_at TIMESTAMP NOT NULL DEFAULT NOW())");
            Integer cnt = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM system_flags WHERE key=?", Integer.class, FLAG_KEY);
            if (cnt != null && cnt > 0) {
                log.debug("[subcash-balance-recompute] already applied — skip");
                return;
            }
            int updated = recompute();
            jdbc.update("INSERT INTO system_flags(key) VALUES(?) ON CONFLICT DO NOTHING", FLAG_KEY);
            log.info("[subcash-balance-recompute] applied — {} SUB_CASH updated", updated);
        } catch (Exception e) {
            log.error("[subcash-balance-recompute] FAILED:", e);
        }
    }

    @Transactional
    public int recompute() {
        // Tüm MANUAL inclusion'ları çek. Önceki commit (72ced5a) legacy formula
        // ile balance'a profit eklemişti; şimdi tam amount'a düzelt — correction.
        List<SubCashTxInclusion> manuals = inclusionRepository
                .findAll().stream()
                .filter(i -> i.getScope() == InclusionScope.MANUAL)
                .toList();

        Map<UUID, BigDecimal> corrections = new HashMap<>();
        for (SubCashTxInclusion inc : manuals) {
            BankAccount subCash = inc.getSubCash();
            Transaction tx = inc.getTransaction();
            if (subCash == null || tx == null) continue;
            if (subCash.getType() != BankAccountType.SUB_CASH) continue;
            // Double-count guard: tx zaten sub-cash bank_account'ına routed ise skip.
            if (tx.getBankAccount() != null
                    && tx.getBankAccount().getId().equals(subCash.getId())) continue;
            BigDecimal oldDelta = legacyIncomeValue(tx);
            BigDecimal newDelta = simpleIncomeValue(tx);
            BigDecimal correction = newDelta.subtract(oldDelta);
            if (correction.signum() == 0) continue;
            corrections.merge(subCash.getId(), correction, BigDecimal::add);
        }

        int updated = 0;
        for (Map.Entry<UUID, BigDecimal> e : corrections.entrySet()) {
            BankAccount sc = bankAccountRepository.findById(e.getKey()).orElse(null);
            if (sc == null) continue;
            BigDecimal current = sc.getCurrentBalance() != null
                    ? sc.getCurrentBalance() : BigDecimal.ZERO;
            sc.setCurrentBalance(current.add(e.getValue()));
            bankAccountRepository.save(sc);
            updated++;
            log.info("[subcash-balance-recompute] subCash={} correction={}",
                    sc.getId(), e.getValue());
        }
        return updated;
    }

    /** Önceki commit (72ced5a) tarafından eklenen yanlış delta — legacy formula. */
    private static BigDecimal legacyIncomeValue(Transaction t) {
        if (t == null || t.getAmount() == null) return BigDecimal.ZERO;
        // FİNANSAL KURAL (Z, 2026-06): TRANSFER + LOAN alt-kasa bakiyesine girmez.
        if (t.getKind() == TransactionKind.TRANSFER
                || t.getKind() == TransactionKind.LOAN) return BigDecimal.ZERO;
        String pm = t.getPaymentMethod();
        boolean isPos = pm != null && pm.toUpperCase(java.util.Locale.ENGLISH).startsWith("POS");
        if (isPos && t.getDirection() == TransactionDirection.INCOME) {
            BigDecimal bankRate = t.getAppliedPosRate() != null
                    ? t.getAppliedPosRate() : t.getPosRate();
            BigDecimal ourRate = t.getAppliedOurCommissionRate();
            if (bankRate != null && ourRate != null) {
                BigDecimal diff = ourRate.subtract(bankRate);
                if (diff.signum() == 0) return BigDecimal.ZERO;
                return t.getAmount().multiply(diff)
                        .divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
            }
            return t.getAmount();
        }
        if (t.getDirection() == TransactionDirection.INCOME) return t.getAmount();
        if (t.getDirection() == TransactionDirection.EXPENSE) return t.getAmount().negate();
        return BigDecimal.ZERO;
    }

    /** Beta v1.1 yeni formula — POS dahil tüm income amount, komisyon yok. */
    private static BigDecimal simpleIncomeValue(Transaction t) {
        if (t == null || t.getAmount() == null) return BigDecimal.ZERO;
        // FİNANSAL KURAL (Z, 2026-06): TRANSFER + LOAN alt-kasa bakiyesine girmez.
        if (t.getKind() == TransactionKind.TRANSFER
                || t.getKind() == TransactionKind.LOAN) return BigDecimal.ZERO;
        if (t.getDirection() == TransactionDirection.INCOME) return t.getAmount();
        if (t.getDirection() == TransactionDirection.EXPENSE) return t.getAmount().negate();
        return BigDecimal.ZERO;
    }
}
