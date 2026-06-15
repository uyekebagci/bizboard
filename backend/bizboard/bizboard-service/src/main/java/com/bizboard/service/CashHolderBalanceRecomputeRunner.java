package com.bizboard.service;

import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

/**
 * fix(cash) P0 — CASH_HOLDER current_balance'ındaki HAYALİ LOAN tahsilatı
 * snapshot'ını temizler.
 *
 * <h2>Kök neden</h2>
 * <p>Eski {@code PaymentService.createPayment} cari tahsilat ({@code kind=LOAN})
 * tutarını CASH_HOLDER {@code current_balance}'ına DOĞRUDAN yazıyordu — posting
 * bırakmadan. Önceki {@link LoanCashExclusionRestoreRunner} posting-delta (gerçek
 * hesaba yazılmış LOCATION_MOVE bacağı) ölçtüğü için bu doğrudan-yazılan snapshot
 * etkisini KAÇIRDI (posting-delta = 0). {@code ConsolidatedDashboardService}'in
 * {@code total_cash = closing.actual + Σ CASH_HOLDER.current_balance} formülü de
 * stored snapshot'ı kullandığından hayali tutar "Bugünün Kasa Durumu / Genel
 * Nakit"e şişmiş olarak yansıyor.</p>
 *
 * <h2>Ne yapar (authoritative, idempotent, non-fatal)</h2>
 * <p>TÜM CASH_HOLDER hesaplarının {@code current_balance}'ını, kendisine
 * {@code bank_account} FK'sı ile routed tx'lerden YENİDEN TÜRETİR
 * ({@link CashHolderBalanceCalculator}). Authoritative formül create/settle
 * akışıyla birebir: NAKIT/HESAPDAN ±amount, settle-edilmiş POS +net, LOAN/TRANSFER
 * 0. Cerrahi delta değil — hesabın doğru bakiyesi zaten tx-türevli olduğundan tam
 * recompute güvenli ve idempotent (çift koşması aynı sonucu verir).</p>
 *
 * <p><b>Kapsam:</b> yalnız CASH_HOLDER. MAIN_CASH/SUB_CASH üye-hesap aggregate'i
 * (posting/tx-türevli DEĞİL) → DOKUNULMAZ. CHECKING/SAVINGS (banka) bu bug'dan
 * etkilenmedi → DOKUNULMAZ. Net/cari (Debt entity'sinden okunur) değişmez — bu
 * yalnız kasa snapshot düzeltmesi. Scope per-account = per-business (cross-tenant
 * etki yok).</p>
 *
 * <p><b>İdempotency:</b> fix(cash) Kural Z (kalıcı) — runner artık HER BOOT'TA
 * çalışır (tek-sefer {@code system_flags} bayrağı KALDIRILDI). Tam authoritative
 * recompute olduğundan ve yalnız değer farklıysa save ettiğinden çift koşmak
 * güvenli + ucuz; herhangi bir kalıntı/legacy drift (örn. eski deploy'da bumplanmış
 * tahsilat snapshot'ı) her boot'ta SELF-HEAL olur. Ongoing yazma yolu
 * ({@link TransactionMutationService#affectsCashSnapshot}) LOAN/TRANSFER'i artık
 * snapshot'a yansıtmadığından recompute tekrar şişmeyi GERİ ALMAZ — doğru değerde
 * sabit kalır (no-op olur).
 * {@code @Order(90)}: {@link LoanCashExclusionRestoreRunner} ({@code @Order(80)})
 * SONRASI — posting yeniden-türetme bittikten sonra snapshot'ı authoritative'e oturt.</p>
 *
 * <p>v2.0.0'da Flyway/Liquibase'e taşınınca silinir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(90) // LoanCashExclusionRestoreRunner (80) SONRASI
public class CashHolderBalanceRecomputeRunner implements ApplicationRunner {

    private final BankAccountRepository bankAccountRepository;
    private final TransactionRepository transactionRepository;

    @Override
    public void run(ApplicationArguments args) {
        try {
            // fix(cash) Kural Z (kalıcı): tek-sefer flag YOK — her boot'ta authoritative
            // recompute (idempotent; yalnız farklıysa save). Ongoing path LOAN'ı artık
            // snapshot'a yazmadığı için tekrar şişme olmaz → recompute no-op'a yakınsar.
            int updated = recompute();
            log.info("[cashholder-balance-recompute] applied (every-boot, idempotent) — "
                    + "{} CASH_HOLDER bakiyesi authoritative recompute edildi "
                    + "(LOAN/TRANSFER tahsilatı kasaya yansımaz, Kural Z).", updated);
        } catch (Exception e) {
            // Boot'u DÜŞÜRME — non-fatal; sonraki boot tekrar dener.
            log.error("[cashholder-balance-recompute] FAILED (boot devam ediyor):", e);
        }
    }

    /** Tüm CASH_HOLDER bakiyesini routed tx'lerden authoritative yeniden türet. */
    @Transactional
    public int recompute() {
        List<BankAccount> holders = bankAccountRepository
                .findAllByOrderByActiveDescNameAsc().stream()
                .filter(b -> b.getType() == BankAccountType.CASH_HOLDER)
                .toList();

        int updated = 0;
        for (BankAccount holder : holders) {
            List<Transaction> txs = transactionRepository.findByBankAccountId(holder.getId());
            BigDecimal authoritative = CashHolderBalanceCalculator.authoritativeBalance(txs);
            BigDecimal current = holder.getCurrentBalance() != null
                    ? holder.getCurrentBalance() : BigDecimal.ZERO;
            if (current.compareTo(authoritative) == 0) {
                continue; // zaten doğru — gereksiz save yok
            }
            log.info("[cashholder-balance-recompute] holder={} ({}) current_balance {} → {} "
                    + "(LOAN'sız {} tx'ten türetildi)",
                    holder.getId(), holder.getName(),
                    current.toPlainString(), authoritative.toPlainString(), txs.size());
            holder.setCurrentBalance(authoritative);
            bankAccountRepository.save(holder);
            updated++;
        }
        return updated;
    }
}
