package com.bizboard.service;

import com.bizboard.common.dto.DebtSummaryDto;
import com.bizboard.common.entity.Debt;
import com.bizboard.common.enums.DebtDirection;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;

/**
 * WP a9da4e9d: Borç/alacak özet hesaplayıcısı.
 *
 * <p>DebtService'ten ayrı tutuldu (500 satır sınırı). USD/GOLD borçlar GÜNCEL
 * kurla TL'ye çevrilip toplanır ({@link DebtAmountConverter}); TRY aynen. magnitude
 * pozitif; net = pendingReceivable − pendingPayable.</p>
 */
@Component
@RequiredArgsConstructor
public class DebtSummaryCalculator {

    private final DebtAmountConverter amountConverter;

    public DebtSummaryDto build(List<Debt> debts) {
        BigDecimal totalReceivable = BigDecimal.ZERO, totalPayable = BigDecimal.ZERO;
        BigDecimal settledReceivable = BigDecimal.ZERO, settledPayable = BigDecimal.ZERO;
        BigDecimal pendingReceivable = BigDecimal.ZERO, pendingPayable = BigDecimal.ZERO;
        int receivableCount = 0, payableCount = 0;

        for (Debt d : debts) {
            BigDecimal amountTl = amountConverter.fullToTry(d);
            BigDecimal baseRem = d.getRemainingAmount() != null ? d.getRemainingAmount() : d.getAmount();
            BigDecimal remainingTl = amountConverter.toTry(d, baseRem);
            if (d.getDirection() == DebtDirection.RECEIVABLE) {
                totalReceivable = totalReceivable.add(amountTl);
                receivableCount++;
                if (d.isSettled()) settledReceivable = settledReceivable.add(amountTl);
                else pendingReceivable = pendingReceivable.add(remainingTl);
            } else {
                totalPayable = totalPayable.add(amountTl);
                payableCount++;
                if (d.isSettled()) settledPayable = settledPayable.add(amountTl);
                else pendingPayable = pendingPayable.add(remainingTl);
            }
        }

        return DebtSummaryDto.builder()
                .totalReceivable(totalReceivable)
                .totalPayable(totalPayable)
                .netBalance(pendingReceivable.subtract(pendingPayable))
                .settledReceivable(settledReceivable)
                .settledPayable(settledPayable)
                .pendingReceivable(pendingReceivable)
                .pendingPayable(pendingPayable)
                .receivableCount(receivableCount)
                .payableCount(payableCount)
                .build();
    }

    public DebtSummaryDto empty() {
        return DebtSummaryDto.builder()
                .totalReceivable(BigDecimal.ZERO).totalPayable(BigDecimal.ZERO)
                .netBalance(BigDecimal.ZERO)
                .settledReceivable(BigDecimal.ZERO).settledPayable(BigDecimal.ZERO)
                .pendingReceivable(BigDecimal.ZERO).pendingPayable(BigDecimal.ZERO)
                .receivableCount(0).payableCount(0)
                .build();
    }
}
