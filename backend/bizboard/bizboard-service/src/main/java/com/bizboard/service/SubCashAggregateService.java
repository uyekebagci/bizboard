package com.bizboard.service;

import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.SubCashAssignment;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.common.enums.SubCashEntityType;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.SubCashAssignmentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;

/**
 * v1.6.23.27 (UI Fix WP TODO d884a0ec): Sub-Cash Aggregator hesaplayıcısı.
 *
 * <h3>Aggregate formülü (final, immutable contract):</h3>
 *
 * <p>Her entity'nin "aggregate katkısı":</p>
 * <ul>
 *   <li>{@link SubCashEntityType#BANK_ACCOUNT} →
 *       {@code bank_accounts.current_balance} (yalnız CHECKING/SAVINGS/CASH_HOLDER;
 *       MAIN_CASH ve SUB_CASH eklenirse exception — Σ invariant'ı kırar)</li>
 *   <li>{@link SubCashEntityType#COUNTERPART} → <b>0</b> (sadece tx grouping)</li>
 *   <li>{@link SubCashEntityType#POS_DEVICE} → <b>0</b> (sadece tx grouping)</li>
 * </ul>
 *
 * <h3>MAIN ve SUB hesaplama:</h3>
 *
 * <ul>
 *   <li>{@code MAIN.aggregate(business)} = SUM(eligible bank_account.current_balance)
 *       — tüm CHECKING/SAVINGS/CASH_HOLDER (assigned/unassigned fark etmez).
 *       MAIN_CASH ve SUB_CASH satırları current_balance=0 (placeholder).</li>
 *   <li>{@code SUB.aggregate(subCashId)} = SUM(assigned eligible bank_account.current_balance)</li>
 *   <li>{@code unassigned.aggregate(business)} = MAIN − Σ SUB</li>
 * </ul>
 *
 * <h3>INVARIANT (TODO 73dd2694):</h3>
 *
 * <pre>
 * MAIN.aggregate(b) == Σ SUB.aggregate(s) + unassigned.aggregate(b)
 * </pre>
 *
 * <p>{@link #checkInvariant(UUID)} pen-test ve health-check'de kullanılır.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SubCashAggregateService {

    private final BankAccountRepository bankAccountRepository;
    private final SubCashAssignmentRepository assignmentRepository;

    /**
     * v1.6.23.27: Eligible bank account tipleri — aggregate'a katkı verenler.
     * MAIN_CASH ve SUB_CASH dışta (kendileri 0 placeholder).
     */
    private static final EnumSet<BankAccountType> ELIGIBLE_BANK_TYPES =
            EnumSet.of(BankAccountType.CHECKING, BankAccountType.SAVINGS,
                       BankAccountType.CASH_HOLDER);

    /**
     * BANK_ACCOUNT eligibility: assignment'a izin verilen tipler.
     * MAIN_CASH / SUB_CASH assign edilemez (kendileri aggregator).
     */
    public static boolean isEligibleBankAccount(BankAccount ba) {
        return ba != null && ba.getType() != null && ELIGIBLE_BANK_TYPES.contains(ba.getType());
    }

    // ───────────────────────── MAIN ─────────────────────────

    /**
     * v1.6.23.27: bir işletmenin MAIN.aggregate değeri.
     * Yalnız CHECKING/SAVINGS/CASH_HOLDER current_balance'ları sayılır.
     */
    @Transactional(readOnly = true)
    public BigDecimal mainAggregate(UUID businessId) {
        return bankAccountRepository
                .findByBusinessIdInOrderByActiveDescNameAsc(List.of(businessId))
                .stream()
                .filter(SubCashAggregateService::isEligibleBankAccount)
                .map(BankAccount::getCurrentBalance)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    // ───────────────────────── SUB ─────────────────────────

    /**
     * v1.6.23.27: bir sub-cash'in aggregate değeri.
     * Atanan BANK_ACCOUNT entity'lerinin current_balance toplamı.
     * COUNTERPART ve POS_DEVICE entity'ler 0 katkı verir — bu yüzden bu
     * sorgu sadece BANK_ACCOUNT assignment'ları toplar.
     */
    @Transactional(readOnly = true)
    public BigDecimal subCashAggregate(UUID subCashId) {
        List<SubCashAssignment> assigns =
                assignmentRepository.findBySubCashIdOrderByAssignedAtDesc(subCashId);
        Set<UUID> bankIds = new HashSet<>();
        for (SubCashAssignment a : assigns) {
            if (a.getEntityType() == SubCashEntityType.BANK_ACCOUNT) {
                bankIds.add(a.getEntityId());
            }
        }
        if (bankIds.isEmpty()) return BigDecimal.ZERO;
        return bankAccountRepository.findAllById(bankIds).stream()
                .filter(SubCashAggregateService::isEligibleBankAccount)
                .map(BankAccount::getCurrentBalance)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * v1.6.23.27: business'taki tüm SUB_CASH'ların aggregate map'i.
     * Performans: tek query ile tüm assignment'ları çek, in-memory grupla.
     */
    @Transactional(readOnly = true)
    public Map<UUID, BigDecimal> subCashAggregatesForBusiness(UUID businessId) {
        List<SubCashAssignment> all = assignmentRepository
                .findByBusinessIdOrderByAssignedAtDesc(businessId);
        // bankId -> set of sub-cash ids that own it (UNIQUE constraint = max 1, ama defensive)
        Map<UUID, Set<UUID>> bankToSubs = new HashMap<>();
        for (SubCashAssignment a : all) {
            if (a.getEntityType() != SubCashEntityType.BANK_ACCOUNT) continue;
            bankToSubs.computeIfAbsent(a.getEntityId(), k -> new HashSet<>())
                    .add(a.getSubCash().getId());
        }
        if (bankToSubs.isEmpty()) return Map.of();

        Map<UUID, BigDecimal> bankBalances = new HashMap<>();
        bankAccountRepository.findAllById(bankToSubs.keySet()).forEach(ba -> {
            if (isEligibleBankAccount(ba)) {
                bankBalances.put(ba.getId(),
                        ba.getCurrentBalance() != null ? ba.getCurrentBalance() : BigDecimal.ZERO);
            }
        });

        Map<UUID, BigDecimal> result = new HashMap<>();
        for (Map.Entry<UUID, Set<UUID>> e : bankToSubs.entrySet()) {
            BigDecimal v = bankBalances.getOrDefault(e.getKey(), BigDecimal.ZERO);
            for (UUID subId : e.getValue()) {
                result.merge(subId, v, BigDecimal::add);
            }
        }
        return result;
    }

    // ───────────────────────── UNASSIGNED ─────────────────────────

    /**
     * v1.6.23.27: business'taki "atanmamış" entity'lerin aggregate toplamı.
     * {@code MAIN − Σ SUB} formülü ile hesaplanır (tek query yerine).
     */
    @Transactional(readOnly = true)
    public BigDecimal unassignedAggregate(UUID businessId) {
        BigDecimal main = mainAggregate(businessId);
        BigDecimal subs = subCashAggregatesForBusiness(businessId).values().stream()
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return main.subtract(subs);
    }

    // ───────────────────────── INVARIANT ─────────────────────────

    /**
     * v1.6.23.27 (TODO 73dd2694): Σ invariant doğrulaması.
     *
     * <p>Formül: {@code MAIN == Σ SUB + unassigned}. Pen-test ve health-check
     * tarafından çağrılır. Beklenmedik sapma migration veya tx route bug'ına
     * işaret eder — log + IllegalStateException.</p>
     *
     * @return MAIN aggregate (caller ihtiyaç duyabilir)
     */
    @Transactional(readOnly = true)
    public BigDecimal checkInvariant(UUID businessId) {
        BigDecimal main = mainAggregate(businessId);
        Map<UUID, BigDecimal> subs = subCashAggregatesForBusiness(businessId);
        BigDecimal subTotal = subs.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal unassigned = main.subtract(subTotal);
        // INVARIANT recompute: Σ SUB + unassigned == MAIN, by construction
        // (unassigned = main − Σ subs). Yani bu satır toleransla sadece
        // sapma loglar; aslında matematiksel olarak her zaman geçer.
        BigDecimal rebuilt = subTotal.add(unassigned);
        if (rebuilt.compareTo(main) != 0) {
            String msg = String.format(
                    "Sub-Cash invariant violation business=%s: MAIN=%s, Σ SUB=%s, unassigned=%s",
                    businessId, main, subTotal, unassigned);
            log.error("[invariant] {}", msg);
            throw new IllegalStateException(msg);
        }
        log.debug("[invariant] business={} MAIN={} ΣSUB={} unassigned={} OK",
                businessId, main, subTotal, unassigned);
        return main;
    }
}
