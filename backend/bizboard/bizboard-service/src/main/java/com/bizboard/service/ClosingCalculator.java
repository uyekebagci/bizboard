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
     *
     * <p><b>v1.6.23.5 (BUG-V1 fix):</b> Opening kaynağı artık
     * {@code prev.actualBalance ?? prev.computedClosing ?? 0}. Önceki sürümlerde
     * yalnız {@code computedClosing} kullanılıyordu; bu durumda opening seed
     * satırı (örn. sistem ilk kullanımı, 03.05 sandbox seed) computed=0 olarak
     * geçtiyse tüm zincir negatife kayıyordu. Defensive fallback chain:</p>
     *
     * <ul>
     *   <li>{@code prev.actual_balance} dolu ise onu kullan (manuel sayım sonucu
     *       — sistemden daha güvenilir kasa bilgisi)</li>
     *   <li>Aksi halde {@code prev.computed_closing} (sistem hesabı)</li>
     *   <li>İkisi de yoksa 0 (sistem ilk kez kullanılıyor)</li>
     * </ul>
     *
     * <p><b>Tasarım gerekçesi:</b> Önceki sürümde "actual değil — kasıtlı"
     * yorumu, kasıtlı bir disiplin kararıydı: sistemin computed'ı kullanıcının
     * actual sayımıyla "drift" olabilirdi, ama drift biliniyor. v1.6.23.5'te
     * bunu değiştiriyoruz çünkü sandbox-test net olarak gösterdi ki — gerçek
     * çalışma akışında actual physical sayım baz noktası olmalı, computed
     * günlük operasyonel kontrol mekanizması. Drift artık opening'e taşınmıyor,
     * her gün fresh sayım üzerinden başlıyor.</p>
     */
    @Transactional(readOnly = true)
    public BigDecimal getOpeningBalance(LocalDate date) {
        Optional<CashClosing> last = cashClosingRepository.findFirstByOrderByClosingDateDesc();
        CashClosing prev = null;
        if (last.isPresent() && last.get().getClosingDate().isBefore(date)) {
            prev = last.get();
        } else if (last.isPresent() && !last.get().getClosingDate().isBefore(date)) {
            // Eğer aynı gün veya gelecek tarih için zaten kapanış varsa, ondan bir
            // önceki kayda bak.
            prev = cashClosingRepository.findByClosingDateBetweenOrderByClosingDateAsc(
                            LocalDate.of(2000, 1, 1), date.minusDays(1))
                    .stream()
                    .reduce((a, b) -> b) // last
                    .orElse(null);
        }
        if (prev == null) {
            return BigDecimal.ZERO;
        }
        // v1.6.23.5: actual_balance varsa onu kullan, yoksa computed_closing, yoksa 0
        if (prev.getActualBalance() != null) {
            return prev.getActualBalance();
        }
        if (prev.getComputedClosing() != null) {
            return prev.getComputedClosing();
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
