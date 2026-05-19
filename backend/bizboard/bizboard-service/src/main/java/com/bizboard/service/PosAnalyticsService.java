package com.bizboard.service;

import com.bizboard.common.dto.PosAnalyticsDto;
import com.bizboard.common.entity.Transaction;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

/**
 * v1.6.21 (WP-4): POS analytics — gün-gün çekim / komisyon / net / settled count.
 *
 * <p>Komisyon = amount × appliedPosRate / 100. {@code applied_pos_rate}
 * snapshot olduğu için cihazın rate'i sonra değişse bile geçmiş hesap doğru kalır.</p>
 *
 * <p>POS Kar = -komisyon (kasa açısından negatif), ya da
 * net = amount - komisyon (hesaba düşen gerçek miktar). Frontend her ikisini
 * de görüntüleyebilir.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PosAnalyticsService {

    private final TransactionRepository transactionRepository;

    @Transactional(readOnly = true)
    public PosAnalyticsDto analytics(LocalDate from, LocalDate to, java.util.UUID deviceId) {
        LocalDate fromDate = from != null ? from : LocalDate.now().minusDays(29);
        LocalDate toDate = to != null ? to : LocalDate.now();
        if (toDate.isBefore(fromDate)) {
            // swap
            LocalDate t = fromDate; fromDate = toDate; toDate = t;
        }

        // Gün-gün boş seri oluştur (data sparse ise bile chart smooth olsun).
        Map<LocalDate, DailyAcc> acc = new TreeMap<>();
        for (LocalDate d = fromDate; !d.isAfter(toDate); d = d.plusDays(1)) {
            acc.put(d, new DailyAcc());
        }

        // Gün-gün tx'leri çek — basit loop (DGR ölçeği için yeterli).
        // Cihaz filtresi varsa per-day per-device fetch; yoksa tüm POS tx'ler.
        for (LocalDate d = fromDate; !d.isAfter(toDate); d = d.plusDays(1)) {
            List<Transaction> txs;
            if (deviceId != null) {
                txs = transactionRepository.findByPosDeviceIdAndDate(deviceId, d);
            } else {
                // Tüm POS tx'ler (paymentMethod=POS) o gün.
                txs = transactionRepository.findByDate(d).stream()
                        .filter(t -> "POS".equalsIgnoreCase(t.getPaymentMethod()))
                        .toList();
            }
            DailyAcc a = acc.get(d);
            for (Transaction t : txs) {
                if (t.getAmount() == null) continue;
                BigDecimal rate = t.getAppliedPosRate() != null
                        ? t.getAppliedPosRate()
                        : (t.getPosRate() != null ? t.getPosRate() : BigDecimal.ZERO);
                BigDecimal comm = t.getAmount().multiply(rate)
                        .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
                a.gross = a.gross.add(t.getAmount());
                a.commission = a.commission.add(comm);
                a.txCount++;
                if (Boolean.TRUE.equals(t.getPosSettled())) a.settled++;
                else if (Boolean.FALSE.equals(t.getPosSettled())) a.unsettled++;
                // null = nakit/non-POS (anlamsız) — sayma
            }
        }

        // Series + totals
        List<PosAnalyticsDto.DailyPoint> series = new ArrayList<>(acc.size());
        BigDecimal totGross = BigDecimal.ZERO;
        BigDecimal totComm = BigDecimal.ZERO;
        int totTx = 0, totSet = 0, totUnset = 0;
        for (Map.Entry<LocalDate, DailyAcc> e : acc.entrySet()) {
            DailyAcc a = e.getValue();
            series.add(PosAnalyticsDto.DailyPoint.builder()
                    .date(e.getKey())
                    .gross(a.gross)
                    .commission(a.commission)
                    .net(a.gross.subtract(a.commission))
                    .txCount(a.txCount)
                    .settledCount(a.settled)
                    .unsettledCount(a.unsettled)
                    .build());
            totGross = totGross.add(a.gross);
            totComm = totComm.add(a.commission);
            totTx += a.txCount;
            totSet += a.settled;
            totUnset += a.unsettled;
        }

        return PosAnalyticsDto.builder()
                .from(fromDate)
                .to(toDate)
                .deviceId(deviceId)
                .series(series)
                .totals(PosAnalyticsDto.Totals.builder()
                        .gross(totGross)
                        .commission(totComm)
                        .net(totGross.subtract(totComm))
                        .txCount(totTx)
                        .settledCount(totSet)
                        .unsettledCount(totUnset)
                        .build())
                .build();
    }

    /** Internal mutable accumulator. */
    private static class DailyAcc {
        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal commission = BigDecimal.ZERO;
        int txCount = 0;
        int settled = 0;
        int unsettled = 0;
    }
}
