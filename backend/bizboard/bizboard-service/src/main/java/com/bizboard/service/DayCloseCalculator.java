package com.bizboard.service;

import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.DayClose;
import com.bizboard.common.entity.DayOpen;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.DayCloseStatus;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.DayCloseRepository;
import com.bizboard.repository.DayOpenRepository;
import com.bizboard.repository.PostingRepository;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §1.2 / §4) — gün-kapanışı SAĞLAMA HESAP hesaplayıcısı
 * (posting-tabanlı). {@link ClosingCalculator} (tek-kasa, Transaction-tabanlı)
 * KORUNUR; bu hesaplayıcı çok-hesaplı, Posting omurgasından okur.
 *
 * <pre>
 *   ÖNCEKİ KASA    = opening   = önceki gün CLOSED DayClose.actualTotal
 *                                (yoksa fallback: en yakın önceki CLOSED actual; o da yoksa 0)
 *   TOPLAM GELEN   = totalIn   = Σ (parası-olan hesaplara giren LOCATION_MOVE legleri, amount>0)
 *   TOPLAM GİDEN   = totalOut  = |Σ (çıkan LOCATION_MOVE legleri, amount<0)|
 *   OLMASI GEREKEN = computed  = opening − totalOut + totalIn
 * </pre>
 *
 * <p><b>Parası-olan hesaplar:</b> posting-türetilebilir konum hesapları
 * (CASH_HOLDER/CHECKING/SAVINGS/POS_SETTLEMENT/ASSET). MAIN_CASH/SUB_CASH
 * aggregate/read-only kâr-merkezi olduğundan zincire DAHİL EDİLMEZ (§3.11/§3.12).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DayCloseCalculator {

    private final PostingRepository postingRepository;
    private final BankAccountRepository bankAccountRepository;
    private final DayCloseRepository dayCloseRepository;
    /** Gün Açılışı: opening artık DayOpen'ın yuvarlanmış değerinden gelir (varsa). */
    private final DayOpenRepository dayOpenRepository;
    /**
     * fix(cash) Kural Z: per-hesap "computed/devir" bakiyesi posting-Σ yerine
     * tx-türevli authoritative formülden ({@link CashHolderBalanceCalculator})
     * okunur → tahsilat(LOAN)/transfer kasaya yansımaz, consolidated ile tutarlı.
     */
    private final TransactionRepository transactionRepository;

    /**
     * Bir işletmenin gün-kapanışına dahil edilecek "parası olan" (posting-
     * türetilebilir konum) hesapları. Aktif olanlar; pasif hesaplar (bakiyesi
     * sıfırlanmış kapatılmış hesaplar) dahil edilmez.
     */
    @Transactional(readOnly = true)
    public List<BankAccount> moneyHoldingAccounts(UUID businessId) {
        return bankAccountRepository
                .findByActiveTrueAndBusinessIdInOrderByNameAsc(List.of(businessId))
                .stream()
                .filter(a -> a.getType() != null && a.getType().isPostingDerivable())
                .toList();
    }

    /** Parası-olan hesap id listesi (sorgu parametresi için). */
    @Transactional(readOnly = true)
    public List<UUID> moneyHoldingAccountIds(UUID businessId) {
        return moneyHoldingAccounts(businessId).stream().map(BankAccount::getId).toList();
    }

    /**
     * ÖNCEKİ KASA (opening) — Gün Açılışı entegrasyonu (KAPSAM §4):
     *
     * <ol>
     *   <li><b>Birincil:</b> o gün için bir {@link DayOpen} kaydı varsa opening
     *       artık onun <b>yuvarlanmış</b> ({@code roundedTotal}) değeridir — ham
     *       prior-actual'dan DEĞİL. Devir-yuvarlama farkı zaten Σ=0 posting ile
     *       hesap bakiyelerine yansıdığından SAĞLAMA HESAP tutarlı kalır
     *       ({@code recomputeChainFrom} uyumlu).</li>
     *   <li><b>Fallback (gün açılmamış / eski veri):</b> {@code date}'ten ÖNCEKİ
     *       en yakın CLOSED DayClose'un {@code actualTotal}'ı (otomatik devir,
     *       §4 madde 6); yoksa {@code computedClosing}; o da yoksa 0. Boşluk
     *       (atlanmış gün) zinciri kopartmaz — en yakın önceki CLOSED'a düşer.</li>
     * </ol>
     */
    @Transactional(readOnly = true)
    public BigDecimal openingFor(UUID businessId, LocalDate date) {
        Optional<DayOpen> dayOpen = dayOpenRepository.findByBusinessIdAndOpenDate(businessId, date);
        if (dayOpen.isPresent()) {
            DayOpen d = dayOpen.get();
            // OPEN ya da CLOSED — her iki durumda da kullanıcının onayladığı
            // yuvarlanmış açılış o günün opening'idir. CLOSE_SYNC kaydı (gün hiç
            // açılmamış, kapanışta türetilmiş) roundedTotal=0 taşır → fallback'e düş.
            if (d.getCreatedVia() != com.bizboard.common.enums.DayOpenCreatedVia.CLOSE_SYNC
                    && d.getRoundedTotal() != null) {
                return d.getRoundedTotal();
            }
        }
        Optional<DayClose> prev = dayCloseRepository
                .findFirstByBusinessIdAndStatusAndCloseDateLessThanOrderByCloseDateDesc(
                        businessId, DayCloseStatus.CLOSED, date);
        if (prev.isEmpty()) return BigDecimal.ZERO;
        DayClose p = prev.get();
        if (p.getActualTotal() != null) return p.getActualTotal();
        if (p.getComputedClosing() != null) return p.getComputedClosing();
        return BigDecimal.ZERO;
    }

    /** TOPLAM GELEN — o gün parası-olan hesaplara giren (amount>0) konum toplamı. */
    @Transactional(readOnly = true)
    public BigDecimal totalInFor(UUID businessId, LocalDate date, List<UUID> accountIds) {
        if (accountIds == null || accountIds.isEmpty()) return BigDecimal.ZERO;
        BigDecimal v = postingRepository.sumLocationInForDate(businessId, date, accountIds);
        return v != null ? v : BigDecimal.ZERO;
    }

    /** TOPLAM GİDEN — o gün çıkan (amount<0) konum toplamının mutlak değeri. */
    @Transactional(readOnly = true)
    public BigDecimal totalOutFor(UUID businessId, LocalDate date, List<UUID> accountIds) {
        if (accountIds == null || accountIds.isEmpty()) return BigDecimal.ZERO;
        BigDecimal v = postingRepository.sumLocationOutForDate(businessId, date, accountIds);
        return v != null ? v.abs() : BigDecimal.ZERO;
    }

    /** OLMASI GEREKEN KASA = opening − totalOut + totalIn. */
    public BigDecimal computedClosing(BigDecimal opening, BigDecimal totalIn, BigDecimal totalOut) {
        return opening.subtract(totalOut).add(totalIn);
    }

    /**
     * Bir hesabın {@code date}'e kadarki (dahil) "computed" bakiyesi — gün açılışı
     * "devir" ve gün-kapanışı hesap-özelinde drill-down için.
     *
     * <p><b>fix(cash) Kural Z (P0):</b> CASH_HOLDER hesapları için bakiye artık ham
     * posting-Σ ({@code sumAmountByAccountIdAsOf}) YERİNE tx-türevli authoritative
     * formülden ({@link CashHolderBalanceCalculator#authoritativeBalanceAsOf})
     * okunur. Kök neden: tahsilat (kind=LOAN) eski deploy'da hesaba REAL
     * LOCATION_MOVE bacağı bırakmıştı (Kural Z öncesi {@code LedgerPostingService});
     * bu legacy bacaklar yeniden-türetilmediği için posting-Σ devre HAYALİ tahsilatı
     * (8.269.000) DAHİL ediyordu — consolidated {@code total_cash}=0 (current_balance
     * snapshot, tx-türevli) ile TUTARSIZ. Authoritative formül LOAN/TRANSFER'i
     * dışlar → devir = consolidated ile birebir.</p>
     *
     * <p>Posting-türetilen banka hesapları (CHECKING/SAVINGS vb.) için ham posting-Σ
     * KORUNUR — bu bug'dan etkilenmediler ve bakiyeleri posting omurgasından doğru
     * türetilir.</p>
     */
    @Transactional(readOnly = true)
    public BigDecimal accountComputedAsOf(UUID accountId, LocalDate date) {
        if (accountId == null) return BigDecimal.ZERO;
        BankAccount account = bankAccountRepository.findById(accountId).orElse(null);
        if (account != null
                && account.getType() == com.bizboard.common.enums.BankAccountType.CASH_HOLDER) {
            // Kural Z: tx-türevli authoritative (LOAN/TRANSFER hariç), asOf=date.
            List<Transaction> txs = transactionRepository.findByBankAccountId(accountId);
            return CashHolderBalanceCalculator.authoritativeBalanceAsOf(txs, date);
        }
        BigDecimal v = postingRepository.sumAmountByAccountIdAsOf(accountId, date);
        return v != null ? v : BigDecimal.ZERO;
    }
}
