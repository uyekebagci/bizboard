package com.bizboard.service;

import com.bizboard.common.entity.CashClosing;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.CashClosingRepository;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * v1.6.19 (WP-2): Günlük kasa kapanışı hesaplama yardımcısı.
 *
 * <p><b>Tek-kasa modeli:</b> DGR roll-out'unda tüm nakit hareketler tek bir
 * havuz olarak görülür. Bu hesaplayıcı yalnız {@code paymentMethod=NAKIT} olan
 * transaction'ları dikkate alır — POS işlemleri banka hesaplarına gider ve
 * fiziksel kasayı etkilemez (POS settled için ayrı raporlama).</p>
 *
 * <p><b>Formül:</b><br>
 * {@code computed_closing(date) = opening_balance(date) + nakit_income(date) - nakit_expense(date)}<br>
 * {@code opening_balance(date) = previous_day_closing.computed_closing (ya da yok ise 0)}</p>
 *
 * <p><b>Carry-over kuralı:</b> Önceki günün {@code actualBalance} ile {@code
 * computedClosing} arasında fark varsa fark TAŞINMAZ — sadece widget'ta
 * gösterilir. Açılış her zaman önceki günün <b>hesaplanmış</b> kapanışı.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ClosingCalculator {

    private final TransactionRepository transactionRepository;
    private final CashClosingRepository cashClosingRepository;

    /**
     * Verilen tarih için açılış bakiyesi.
     * <ul>
     *   <li>Eğer önceki gün(ler) için en az bir CashClosing varsa → en son
     *       kapanışın {@code computedClosing}'i (actual değil — kasıtlı).</li>
     *   <li>Hiç kapanış yoksa → 0 (sistem ilk kez kullanılıyor; admin manuel
     *       opening_balance girene kadar).</li>
     * </ul>
     */
    @Transactional(readOnly = true)
    public BigDecimal getOpeningBalance(LocalDate date) {
        Optional<CashClosing> last = cashClosingRepository.findFirstByOrderByClosingDateDesc();
        if (last.isPresent() && last.get().getClosingDate().isBefore(date)) {
            BigDecimal computed = last.get().getComputedClosing();
            return computed != null ? computed : BigDecimal.ZERO;
        }
        // Eğer aynı gün veya gelecek tarih için zaten kapanış varsa, ondan bir
        // önceki kayda bak.
        if (last.isPresent() && !last.get().getClosingDate().isBefore(date)) {
            return cashClosingRepository.findByClosingDateBetweenOrderByClosingDateAsc(
                            LocalDate.of(2000, 1, 1), date.minusDays(1))
                    .stream()
                    .reduce((a, b) -> b) // last
                    .map(c -> c.getComputedClosing() == null ? BigDecimal.ZERO : c.getComputedClosing())
                    .orElse(BigDecimal.ZERO);
        }
        return BigDecimal.ZERO;
    }

    /**
     * Verilen tarihteki NAKIT akış toplamı = income - expense.
     * Yalnız {@code paymentMethod=NAKIT} olan transaction'lar sayılır.
     */
    @Transactional(readOnly = true)
    public BigDecimal sumCashFlowForDate(LocalDate date) {
        List<Transaction> txs = transactionRepository.findByDate(date);
        BigDecimal income = BigDecimal.ZERO;
        BigDecimal expense = BigDecimal.ZERO;
        for (Transaction t : txs) {
            if (!"NAKIT".equalsIgnoreCase(Objects.requireNonNullElse(t.getPaymentMethod(), "NAKIT"))) {
                continue;
            }
            if (t.getDirection() == TransactionDirection.INCOME) {
                income = income.add(t.getAmount());
            } else if (t.getDirection() == TransactionDirection.EXPENSE) {
                expense = expense.add(t.getAmount());
            }
        }
        return income.subtract(expense);
    }

    /** Verilen tarih için hesaplanmış kapanış = opening + net cash flow. */
    @Transactional(readOnly = true)
    public BigDecimal computeClosing(LocalDate date) {
        BigDecimal opening = getOpeningBalance(date);
        BigDecimal flow = sumCashFlowForDate(date);
        BigDecimal closing = opening.add(flow);
        log.debug("Closing computed: date={} opening={} flow={} closing={}",
                date, opening, flow, closing);
        return closing;
    }
}
