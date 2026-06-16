package com.bizboard.service;

import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.common.enums.TransactionKind;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/**
 * fix(cash): CASH_HOLDER (ve diğer posting-türetilmeyen fiziksel kasa) bakiyesini
 * kendisine atanmış transaction'lardan AUTHORITATIVE olarak yeniden türetir.
 *
 * <h2>Neden</h2>
 * <p>{@code bank_accounts.current_balance} bir snapshot'tır; create/settle akışında
 * {@code TransactionMutationService} tarafından bumplanır. Geçmişte LOAN tahsilatları
 * bu snapshot'a DOĞRUDAN yazılmıştı (eski {@code PaymentService} davranışı) — ama
 * posting bırakmamışlardı, dolayısıyla posting-delta ölçen
 * {@code LoanCashExclusionRestoreRunner} bunları kaçırdı. Sonuç: "Genel Nakit"
 * CASH_HOLDER current_balance'ı hayali LOAN tahsilatını taşıyor.</p>
 *
 * <h2>Authoritative formül (create/settle akışıyla BİREBİR)</h2>
 * <p>Bir hesabın doğru bakiyesi = ona {@code bank_account} FK'sı ile routed
 * tx'lerin işaretli nakit katkılarının toplamı:</p>
 * <ul>
 *   <li><b>NAKIT / HESAPDAN</b> (kind ∉ {LOAN, TRANSFER}): INCOME → +amount,
 *       EXPENSE → −amount. ({@code TransactionMutationService:416-424} ile aynı.)</li>
 *   <li><b>POS + posSettled=true</b> (kind ∉ {LOAN, TRANSFER}): net = amount ×
 *       (1 − rate/100), INCOME tarafında +. ({@code TransactionMutationService:154-165}
 *       reverse-delta'sının pozitif karşılığı.)</li>
 *   <li><b>LOAN / TRANSFER</b>: 0 (operasyonel kasaya yansımaz — finansal kural Z,
 *       2026-06). Settle edilmemiş POS: 0 (henüz kasaya düşmedi).</li>
 * </ul>
 *
 * <p>Opening balance kolonu YOK (BankAccount.currentBalance default 0); ileride
 * eklenirse buraya {@code + opening} eklenmeli.</p>
 *
 * <p>Saf statik hesap — DB/IO yok; çağıran tx listesini sağlar (scope per-account
 * = per-business).</p>
 */
final class CashHolderBalanceCalculator {

    private CashHolderBalanceCalculator() {}

    /** Bir hesaba routed tx listesinin authoritative bakiyesi (LOAN/TRANSFER hariç). */
    static BigDecimal authoritativeBalance(List<Transaction> txForAccount) {
        BigDecimal sum = BigDecimal.ZERO;
        if (txForAccount == null) return sum;
        for (Transaction t : txForAccount) {
            sum = sum.add(cashContribution(t));
        }
        return sum;
    }

    /**
     * fix(cash) Kural Z: bir hesaba routed tx listesinin {@code asOf} tarihine
     * KADAR (dahil) authoritative bakiyesi (LOAN/TRANSFER hariç). Tarihi null
     * tx'ler hariç tutulur (tarihsiz hareket bir güne ait sayılamaz).
     *
     * <p>Gün Açılışı "devir" (önceki günden devreden açılış) ve gün-kapanışı
     * "computed" bakiyesi için: posting-Σ yerine bu authoritative formül kullanılır
     * → tahsilat (LOAN) ve transfer kasaya yansımaz, consolidated {@code total_cash}
     * (= Σ CASH_HOLDER.current_balance) ile BİREBİR tutarlı kalır.</p>
     */
    static BigDecimal authoritativeBalanceAsOf(List<Transaction> txForAccount, LocalDate asOf) {
        BigDecimal sum = BigDecimal.ZERO;
        if (txForAccount == null) return sum;
        for (Transaction t : txForAccount) {
            if (asOf != null && (t.getDate() == null || t.getDate().isAfter(asOf))) {
                continue; // asOf'tan sonraki (veya tarihsiz) hareketler devre girmez
            }
            sum = sum.add(cashContribution(t));
        }
        return sum;
    }

    /**
     * Tek tx'in, bağlı olduğu kasa hesabının current_balance'ına bıraktığı işaretli
     * nakit katkı. LOAN/TRANSFER → 0. (Create/settle delta'sıyla birebir.)
     */
    static BigDecimal cashContribution(Transaction t) {
        if (t == null || t.getAmount() == null) return BigDecimal.ZERO;
        // Finansal kural (Z, 2026-06): LOAN + TRANSFER operasyonel kasaya yansımaz.
        TransactionKind kind = t.getKind();
        if (kind == TransactionKind.LOAN || kind == TransactionKind.TRANSFER) {
            return BigDecimal.ZERO;
        }
        String pm = t.getPaymentMethod();
        boolean isNakitOrHesapdan = "NAKIT".equals(pm) || "HESAPDAN".equals(pm);
        boolean isPos = pm != null && pm.toUpperCase(Locale.ENGLISH).startsWith("POS");

        if (isNakitOrHesapdan) {
            return signed(t);
        }
        if (isPos && Boolean.TRUE.equals(t.getPosSettled())
                && t.getDirection() == TransactionDirection.INCOME) {
            // Settle anında +net eklenmişti: net = amount × (1 − rate/100).
            BigDecimal rate = t.getAppliedPosRate() != null
                    ? t.getAppliedPosRate()
                    : (t.getPosRate() != null ? t.getPosRate() : BigDecimal.ZERO);
            BigDecimal commission = t.getAmount().multiply(rate)
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            return t.getAmount().subtract(commission);
        }
        // POS settle olmamış / diğer payment method → kasaya henüz/hiç düşmedi.
        return BigDecimal.ZERO;
    }

    private static BigDecimal signed(Transaction t) {
        if (t.getDirection() == TransactionDirection.EXPENSE) {
            return t.getAmount().negate();
        }
        return t.getAmount(); // INCOME (default)
    }
}
