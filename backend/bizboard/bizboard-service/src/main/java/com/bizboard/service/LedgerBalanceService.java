package com.bizboard.service;

import com.bizboard.common.entity.BankAccount;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.PostingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz A, §3.1 + §8.8) — bakiye posting-türetme + invariant doğrulama.
 *
 * <p><b>Karar:</b> bir hesabın bakiyesi = Σ o hesaba ait {@code posting.amount}
 * (işaretli). Saklanan {@code bank_accounts.current_balance} snapshot'ı geriye-uyum
 * için KORUNUR (mevcut tüketiciler kırılmaz); bu servis posting-türetilen bakiyeyi
 * AYRI sağlar ve ikisinin uyumunu (invariant) raporlar.</p>
 *
 * <p>Faz A'da bu servis okuma + doğrulama amaçlıdır (mevcut akışları bozmaz).
 * Faz B/C'de posting authority kademeli devralır; snapshot recompute posting-
 * tabanlı olur.</p>
 *
 * <p><b>NOT:</b> MAIN_CASH / SUB_CASH bakiyesi üye-hesap aggregate'idir
 * ({@link SubCashAggregateService}); bunlar posting-türetilmez
 * ({@link com.bizboard.common.enums.BankAccountType#isPostingDerivable()}).
 * Bu servis yalnız posting-türetilebilir hesaplar için anlamlı karşılaştırma yapar.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LedgerBalanceService {

    /** Snapshot ↔ türetilmiş bakiye karşılaştırmasında tolerans (kuruş). */
    private static final BigDecimal TOLERANCE = new BigDecimal("0.01");

    private final PostingRepository postingRepository;
    private final BankAccountRepository bankAccountRepository;

    /**
     * Hesabın posting'lerinden türetilen bakiye (Σ posting.amount). Posting yoksa
     * ZERO.
     */
    @Transactional(readOnly = true)
    public BigDecimal derivedBalance(UUID accountId) {
        BigDecimal sum = postingRepository.sumAmountByAccountId(accountId);
        return sum != null ? sum : BigDecimal.ZERO;
    }

    /**
     * Tüm posting-türetilebilir hesaplar için snapshot ↔ türetilmiş bakiye
     * uyumunu denetler. Saklanan {@code current_balance}'a DOKUNMAZ (read-only
     * rapor) — mevcut akışları kırmaz.
     *
     * @return invariant raporu (toplam/uyumlu/sapan + sapma detayları).
     */
    @Transactional(readOnly = true)
    public InvariantReport checkBalanceInvariant() {
        InvariantReport report = new InvariantReport();
        List<BankAccount> accounts = bankAccountRepository.findAll();
        for (BankAccount acc : accounts) {
            if (acc.getType() == null || !acc.getType().isPostingDerivable()) {
                continue; // MAIN_CASH/SUB_CASH aggregate — posting-türetilmez
            }
            report.checked++;
            BigDecimal snapshot = acc.getCurrentBalance() != null
                    ? acc.getCurrentBalance() : BigDecimal.ZERO;
            BigDecimal derived = derivedBalance(acc.getId());
            BigDecimal diff = snapshot.subtract(derived).abs();
            if (diff.compareTo(TOLERANCE) > 0) {
                report.mismatches.add(new Mismatch(
                        acc.getId(), acc.getName(),
                        acc.getType().name(), snapshot, derived));
            } else {
                report.matched++;
            }
        }
        report.unbalancedEntries = postingRepository.countUnbalancedEntries();
        return report;
    }

    // ───────── DTO'lar (controller / log için) ─────────

    /** Bakiye invariant raporu. */
    public static final class InvariantReport {
        public int checked;
        public int matched;
        public long unbalancedEntries;
        public final List<Mismatch> mismatches = new ArrayList<>();

        public int getChecked() { return checked; }
        public int getMatched() { return matched; }
        public int getMismatchCount() { return mismatches.size(); }
        public long getUnbalancedEntries() { return unbalancedEntries; }
        public List<Mismatch> getMismatches() { return mismatches; }
        public boolean isOk() { return mismatches.isEmpty() && unbalancedEntries == 0; }
    }

    /** Bir hesabın snapshot ↔ türetilmiş bakiye sapması. */
    public record Mismatch(UUID accountId, String accountName, String type,
                           BigDecimal snapshot, BigDecimal derived) {}
}
