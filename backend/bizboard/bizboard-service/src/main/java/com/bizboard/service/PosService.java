package com.bizboard.service;

import com.bizboard.common.dto.PosBusinessSummaryDto;
import com.bizboard.common.dto.PosTransactionRowDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.entity.User;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * v1.6.3: POS işlemleri özet ve günlük detay sorguları.
 *
 * <p>Kullanıcı yetkisi: {@code accessible_businesses} filtresi her sorguda
 * uygulanır. Admin tüm işletmeleri görür, viewer yalnız erişimi olanları.</p>
 */
@Service
@RequiredArgsConstructor
public class PosService {

    private final TransactionRepository transactionRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<PosBusinessSummaryDto> getBusinessSummaries(UUID userId) {
        List<UUID> businessIds = accessibleBusinessIds(userId);
        if (businessIds.isEmpty()) return List.of();

        List<Transaction> posTxs = transactionRepository
                .findByBusinessIdInAndPaymentMethod(businessIds, "POS");
        if (posTxs.isEmpty()) return List.of();

        // Group by business
        Map<UUID, List<Transaction>> byBiz = new HashMap<>();
        for (Transaction t : posTxs) {
            byBiz.computeIfAbsent(t.getBusiness().getId(), k -> new ArrayList<>()).add(t);
        }

        List<PosBusinessSummaryDto> out = new ArrayList<>();
        for (Map.Entry<UUID, List<Transaction>> e : byBiz.entrySet()) {
            List<Transaction> list = e.getValue();
            int count = list.size();
            BigDecimal total = list.stream()
                    .map(Transaction::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            // Ağırlıklı ortalama oran: SUM(amount * rate) / SUM(amount)
            // v1.6.23.7: total_commission ve total_net hesabı da burada (her tx'in
            // applied_pos_rate'i ya da pos_rate'i kullanılarak per-tx komisyon).
            BigDecimal weightedSum = BigDecimal.ZERO;
            BigDecimal denom = BigDecimal.ZERO;
            BigDecimal totalCommission = BigDecimal.ZERO;
            for (Transaction t : list) {
                BigDecimal amt = t.getAmount() != null ? t.getAmount() : BigDecimal.ZERO;
                BigDecimal rate = t.getAppliedPosRate() != null
                        ? t.getAppliedPosRate()
                        : (t.getPosRate() != null ? t.getPosRate() : BigDecimal.ZERO);
                weightedSum = weightedSum.add(amt.multiply(rate));
                denom = denom.add(amt);
                totalCommission = totalCommission.add(
                        amt.multiply(rate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
            }
            BigDecimal avgRate = denom.signum() > 0
                    ? weightedSum.divide(denom, 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            BigDecimal totalNet = total.subtract(totalCommission);

            Transaction first = list.get(0); // findBy ORDER BY date DESC, createdAt DESC
            out.add(PosBusinessSummaryDto.builder()
                    .businessId(e.getKey())
                    .businessName(first.getBusiness().getName())
                    .currency(first.getCurrency() != null ? first.getCurrency() : "TRY")
                    .totalPosCount(count)
                    .totalPosAmount(total)
                    .totalCommission(totalCommission)
                    .totalNet(totalNet)
                    .avgPosRate(avgRate)
                    .lastTxAt(first.getCreatedAt())
                    .build());
        }
        out.sort((a, b) -> b.getTotalPosAmount().compareTo(a.getTotalPosAmount()));
        return out;
    }

    /**
     * v1.6.23.9 (TODO ddda6029): Bekleyen (settled olmamış) POS tx'ler.
     * deviceId verilirse o cihazın, verilmezse tüm cihazların.
     */
    @Transactional(readOnly = true)
    public List<com.bizboard.common.dto.TransactionDto> getUnsettledTransactions(UUID deviceId) {
        List<Transaction> txs = deviceId != null
                ? transactionRepository.findUnsettledPosTransactionsByDevice(deviceId)
                : transactionRepository.findUnsettledPosTransactions();
        return txs.stream().map(DtoMapper::toTransactionDto).toList();
    }

    /**
     * v1.6.23.7: Son N gün için tüm POS tx'leri toparlayan helper.
     * `/pos/transactions/daily?days=N` parametresi için kullanılır.
     */
    @Transactional(readOnly = true)
    public List<PosTransactionRowDto> getRecentTransactions(UUID userId, int days, UUID filterBusinessId) {
        LocalDate today = LocalDate.now();
        LocalDate from = today.minusDays(Math.max(1, days) - 1);
        List<UUID> businessIds = accessibleBusinessIds(userId);
        if (businessIds.isEmpty()) return List.of();
        if (filterBusinessId != null) {
            if (!businessIds.contains(filterBusinessId)) return List.of();
            businessIds = List.of(filterBusinessId);
        }
        List<Transaction> txs = transactionRepository
                .findByBusinessIdInAndPaymentMethodAndDateBetween(businessIds, "POS", from, today);
        return txs.stream().map(this::toRowDto).toList();
    }

    private PosTransactionRowDto toRowDto(Transaction t) {
        BigDecimal amount = t.getAmount() != null ? t.getAmount() : BigDecimal.ZERO;
        BigDecimal rate = t.getAppliedPosRate() != null
                ? t.getAppliedPosRate()
                : (t.getPosRate() != null ? t.getPosRate() : BigDecimal.ZERO);
        BigDecimal commission = amount.multiply(rate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal net = amount.subtract(commission);
        return PosTransactionRowDto.builder()
                .txId(t.getId())
                .businessId(t.getBusiness().getId())
                .businessName(t.getBusiness().getName())
                .amount(amount)
                .posRate(rate)
                .posCommission(commission)
                .netAmount(net)
                .description(t.getDescription())
                .time(t.getCreatedAt())
                .build();
    }

    @Transactional(readOnly = true)
    public List<PosTransactionRowDto> getDailyTransactions(UUID userId, LocalDate date, UUID filterBusinessId) {
        LocalDate eff = date != null ? date : LocalDate.now();
        List<UUID> businessIds = accessibleBusinessIds(userId);
        if (businessIds.isEmpty()) return List.of();

        if (filterBusinessId != null) {
            if (!businessIds.contains(filterBusinessId)) return List.of();
            businessIds = List.of(filterBusinessId);
        }

        List<Transaction> txs = transactionRepository
                .findByBusinessIdInAndPaymentMethodAndDate(businessIds, "POS", eff);

        List<PosTransactionRowDto> out = new ArrayList<>();
        for (Transaction t : txs) {
            BigDecimal amount = t.getAmount() != null ? t.getAmount() : BigDecimal.ZERO;
            BigDecimal rate = t.getPosRate() != null ? t.getPosRate() : BigDecimal.ZERO;
            BigDecimal commission = amount.multiply(rate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            BigDecimal net = amount.subtract(commission);
            out.add(PosTransactionRowDto.builder()
                    .txId(t.getId())
                    .businessId(t.getBusiness().getId())
                    .businessName(t.getBusiness().getName())
                    .amount(amount)
                    .posRate(rate)
                    .posCommission(commission)
                    .netAmount(net)
                    .description(t.getDescription())
                    .time(t.getCreatedAt())
                    .build());
        }
        return out;
    }

    private List<UUID> accessibleBusinessIds(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        String accessible = user.getAccessibleBusinesses();
        if ("admin".equalsIgnoreCase(user.getRole())
                || (accessible != null && "all".equalsIgnoreCase(accessible.trim()))) {
            return businessRepository.findAll().stream()
                    .map(Business::getId).toList();
        }
        if (accessible != null && !accessible.isBlank()) {
            return Arrays.stream(accessible.split(","))
                    .map(String::trim).filter(s -> !s.isEmpty())
                    .map(UUID::fromString).toList();
        }
        return businessRepository.findAllAccessibleByUser(userId).stream()
                .map(Business::getId).toList();
    }
}
