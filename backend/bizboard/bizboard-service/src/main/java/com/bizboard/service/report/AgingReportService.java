package com.bizboard.service.report;

import com.bizboard.common.dto.AgingReportDto;
import com.bizboard.common.entity.Debt;
import com.bizboard.common.enums.DebtDirection;
import com.bizboard.repository.DebtRepository;
import com.bizboard.service.BusinessAccessGuard;
import com.bizboard.service.DebtAmountConverter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * WP 4c75e95c (R3): Alacak/Verecek Yaşlandırma (Aging) raporu — YENİ hesaplama.
 *
 * <p>Açık (settled=false) borçları vade tarihine göre bucket'lara dağıtır:
 * 0-30 / 30-60 / 60-90 / 90+ gün (ref=bugün), vadesiz ayrı. USD/GOLD →
 * {@link DebtAmountConverter} ile GÜNCEL kur TL. RECEIVABLE/PAYABLE ayrı bölüm,
 * cari bazlı satır. magnitude pozitif (conventions).</p>
 *
 * <p>Multi-tenant: businessId verilirse {@code assertCanAccessBusiness}; null ise
 * {@code accessibleBusinessIds} ile tüm erişilebilir tenant'lar.</p>
 */
@Service
@RequiredArgsConstructor
public class AgingReportService {

    private final DebtRepository debtRepository;
    private final DebtAmountConverter amountConverter;
    private final BusinessAccessGuard accessGuard;

    @Transactional(readOnly = true)
    public AgingReportDto build(UUID userId, UUID businessId) {
        List<Debt> debts = loadOpenDebts(userId, businessId);
        LocalDate today = LocalDate.now();

        AgingReportDto.AgingSection receivables = buildSection(debts, DebtDirection.RECEIVABLE, today);
        AgingReportDto.AgingSection payables = buildSection(debts, DebtDirection.PAYABLE, today);

        return AgingReportDto.builder()
                .asOf(today.toString())
                .receivables(receivables)
                .payables(payables)
                .build();
    }

    private List<Debt> loadOpenDebts(UUID userId, UUID businessId) {
        List<Debt> raw;
        if (businessId != null) {
            accessGuard.assertCanAccessBusiness(userId, businessId);
            raw = debtRepository.findByBusinessIdOrderByCreatedAtDesc(businessId);
        } else {
            List<UUID> ids = accessGuard.accessibleBusinessIds(userId);
            if (ids.isEmpty()) return List.of();
            raw = debtRepository.findByBusinessIdInOrderByCreatedAtDesc(ids);
        }
        return raw.stream().filter(d -> !d.isSettled()).toList();
    }

    private AgingReportDto.AgingSection buildSection(List<Debt> debts, DebtDirection dir, LocalDate today) {
        // counterpart adı → bucket toplamları
        Map<String, BigDecimal[]> byCounterpart = new LinkedHashMap<>();
        BigDecimal[] totals = newBuckets();

        for (Debt d : debts) {
            if (d.getDirection() != dir) continue;
            BigDecimal base = d.getRemainingAmount() != null ? d.getRemainingAmount() : d.getAmount();
            BigDecimal tl = amountConverter.toTry(d, base);
            if (tl == null || tl.signum() == 0) continue;

            int idx = bucketIndex(d.getDueDate(), today);
            String name = counterpartName(d);
            BigDecimal[] row = byCounterpart.computeIfAbsent(name, k -> newBuckets());
            row[idx] = row[idx].add(tl);
            totals[idx] = totals[idx].add(tl);
        }

        List<AgingReportDto.AgingRow> rows = new ArrayList<>();
        for (Map.Entry<String, BigDecimal[]> e : byCounterpart.entrySet()) {
            BigDecimal[] b = e.getValue();
            rows.add(AgingReportDto.AgingRow.builder()
                    .counterpartName(e.getKey())
                    .total(sum(b))
                    .bucket0to30(b[0]).bucket30to60(b[1]).bucket60to90(b[2])
                    .bucket90plus(b[3]).noDueDate(b[4])
                    .build());
        }
        rows.sort((a, b) -> b.getTotal().compareTo(a.getTotal()));

        return AgingReportDto.AgingSection.builder()
                .total(sum(totals))
                .bucket0to30(totals[0]).bucket30to60(totals[1]).bucket60to90(totals[2])
                .bucket90plus(totals[3]).noDueDate(totals[4])
                .rows(rows)
                .build();
    }

    /** 0:0-30, 1:30-60, 2:60-90, 3:90+, 4:vadesiz. Geçmiş vadeler gün sayısına göre. */
    private static int bucketIndex(LocalDate dueDate, LocalDate today) {
        if (dueDate == null) return 4;
        long days = ChronoUnit.DAYS.between(dueDate, today); // pozitif = geçmiş (overdue)
        long overdue = Math.max(0, days); // gelecekteki vade → 0-30 grubuna
        if (overdue <= 30) return 0;
        if (overdue <= 60) return 1;
        if (overdue <= 90) return 2;
        return 3;
    }

    private static String counterpartName(Debt d) {
        if (d.getCounterpartRef() != null && d.getCounterpartRef().getName() != null) {
            return d.getCounterpartRef().getName();
        }
        return d.getCounterparty() != null ? d.getCounterparty() : "—";
    }

    private static BigDecimal[] newBuckets() {
        return new BigDecimal[]{
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
        };
    }

    private static BigDecimal sum(BigDecimal[] b) {
        BigDecimal s = BigDecimal.ZERO;
        for (BigDecimal x : b) s = s.add(x);
        return s;
    }
}
