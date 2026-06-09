package com.bizboard.service;

import com.bizboard.common.dto.CashBusinessBalanceDto;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * v1.6.3: nakit (NAKIT payment_method) bakiyesi olan işletmeleri listeler.
 *
 * <p>Formül per business: SUM(amount, INCOME, NAKIT) − SUM(amount, EXPENSE, NAKIT).
 * Yalnız > 0 olanlar döner (kasada nakit var). Sıralama: bakiye DESC.</p>
 */
@Service
@RequiredArgsConstructor
public class CashService {

    private final TransactionRepository transactionRepository;
    private final BusinessAccessGuard accessGuard;

    @Transactional(readOnly = true)
    public List<CashBusinessBalanceDto> getBusinessBalances(UUID userId) {
        List<UUID> businessIds = accessibleBusinessIds(userId);
        if (businessIds.isEmpty()) return List.of();

        List<Transaction> cashTxs = transactionRepository
                .findByBusinessIdInAndPaymentMethod(businessIds, "NAKIT");
        if (cashTxs.isEmpty()) return List.of();

        Map<UUID, BigDecimal> balanceByBiz = new HashMap<>();
        Map<UUID, String> nameByBiz = new HashMap<>();
        for (Transaction t : cashTxs) {
            UUID bid = t.getBusiness().getId();
            BigDecimal amt = t.getAmount() != null ? t.getAmount() : BigDecimal.ZERO;
            BigDecimal signed = t.getDirection() == TransactionDirection.INCOME ? amt : amt.negate();
            balanceByBiz.merge(bid, signed, BigDecimal::add);
            nameByBiz.putIfAbsent(bid, t.getBusiness().getName());
        }

        List<CashBusinessBalanceDto> out = new ArrayList<>();
        for (Map.Entry<UUID, BigDecimal> e : balanceByBiz.entrySet()) {
            if (e.getValue().signum() > 0) {
                out.add(CashBusinessBalanceDto.builder()
                        .businessId(e.getKey())
                        .businessName(nameByBiz.get(e.getKey()))
                        .cashBalance(e.getValue())
                        .build());
            }
        }
        out.sort((a, b) -> b.getCashBalance().compareTo(a.getCashBalance()));
        return out;
    }

    /** R2 DRY: erişilebilir işletme id'leri tek kaynaktan ({@link BusinessAccessGuard}). */
    private List<UUID> accessibleBusinessIds(UUID userId) {
        return accessGuard.accessibleBusinessIds(userId);
    }
}
