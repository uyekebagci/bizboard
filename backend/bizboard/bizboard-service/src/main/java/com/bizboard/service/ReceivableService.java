package com.bizboard.service;

import com.bizboard.common.dto.ReceivableAggregateDto;
import com.bizboard.common.dto.ReceivableTypeBreakdownDto;
import com.bizboard.common.entity.Debt;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.DebtDirection;
import com.bizboard.repository.DebtRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * v1.6.5: alacak (RECEIVABLE) bazlı aggregate raporlama.
 *
 * `GET /api/receivables` endpoint'i için karşı taraf bazlı özet üretir.
 * Yalnız settled=false RECEIVABLE debt'ler dahil edilir. Erişim kontrolü
 * `User.accessibleBusinesses` üzerinden (DebtService.getDebtsForUser ile aynı
 * mantık).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReceivableService {

    private final DebtRepository debtRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<ReceivableAggregateDto> getReceivables(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        boolean isAdmin = "admin".equalsIgnoreCase(user.getRole());

        // 1) erişilebilir debt set'i
        List<Debt> debts;
        if (isAdmin) {
            debts = debtRepository.findAllByOrderByCreatedAtDesc();
        } else {
            String accessible = user.getAccessibleBusinesses();
            if (accessible == null || accessible.isBlank()) {
                return List.of();
            }
            List<UUID> businessIds = Arrays.stream(accessible.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(UUID::fromString)
                    .toList();
            debts = debtRepository.findByBusinessIdInAndAdminOnlyFalseOrderByCreatedAtDesc(businessIds);
        }

        // 2) yalnız RECEIVABLE + settled=false
        List<Debt> open = debts.stream()
                .filter(d -> d.getDirection() == DebtDirection.RECEIVABLE)
                .filter(d -> !d.isSettled())
                .toList();

        if (open.isEmpty()) return List.of();

        // 3) counterpart bazlı grupla — key: counterpart_id varsa "id:<uuid>",
        //    yoksa "name:<lowercased counterparty>" (legacy free-text).
        Map<String, List<Debt>> grouped = open.stream().collect(Collectors.groupingBy(
                d -> d.getCounterpartRef() != null
                        ? "id:" + d.getCounterpartRef().getId()
                        : "name:" + (d.getCounterparty() == null
                                ? ""
                                : d.getCounterparty().trim().toLowerCase(Locale.ROOT)),
                LinkedHashMap::new,
                Collectors.toList()));

        // 4) her grup için aggregate üret
        List<ReceivableAggregateDto> result = new ArrayList<>(grouped.size());
        for (List<Debt> rows : grouped.values()) {
            Debt first = rows.get(0);

            // Tip kırılımı: SENET / CEK / ALTIN / NAKIT / DIGER (label ile) / UNSPECIFIED
            Map<String, List<Debt>> byType = rows.stream().collect(Collectors.groupingBy(
                    r -> {
                        String t = r.getReceivableType();
                        if (t == null || t.isBlank()) return "UNSPECIFIED";
                        // DIGER → "DIGER:<other>" anahtarı (label ile birleştir)
                        if ("DIGER".equals(t)) {
                            String label = r.getReceivableTypeOther();
                            return "DIGER:" + (label == null ? "" : label.trim());
                        }
                        return t;
                    }, LinkedHashMap::new, Collectors.toList()));

            List<ReceivableTypeBreakdownDto> breakdowns = new ArrayList<>(byType.size());
            for (Map.Entry<String, List<Debt>> e : byType.entrySet()) {
                String key = e.getKey();
                List<Debt> chunk = e.getValue();
                BigDecimal sum = chunk.stream()
                        .map(Debt::getAmount)
                        .filter(Objects::nonNull)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);

                String type;
                String label = null;
                if (key.startsWith("DIGER:")) {
                    type = "DIGER";
                    String rawLabel = key.substring("DIGER:".length());
                    label = rawLabel.isEmpty() ? null : rawLabel;
                } else {
                    type = key;
                }

                breakdowns.add(ReceivableTypeBreakdownDto.builder()
                        .type(type)
                        .label(label)
                        .amount(sum)
                        .count(chunk.size())
                        .build());
            }

            // toplam
            BigDecimal total = rows.stream()
                    .map(Debt::getAmount)
                    .filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            LocalDate lastDue = rows.stream()
                    .map(Debt::getDueDate)
                    .filter(Objects::nonNull)
                    .max(LocalDate::compareTo)
                    .orElse(null);

            result.add(ReceivableAggregateDto.builder()
                    .counterpartId(first.getCounterpartRef() != null
                            ? first.getCounterpartRef().getId()
                            : null)
                    .counterpartName(first.getCounterpartRef() != null
                            ? first.getCounterpartRef().getName()
                            : first.getCounterparty())
                    .totalAmount(total)
                    .currency(first.getCurrency() != null ? first.getCurrency() : "TRY")
                    .receivableTypes(breakdowns)
                    .lastDueDate(lastDue)
                    .count(rows.size())
                    .build());
        }

        // 5) tutar DESC sırala (default beklenti)
        result.sort((a, b) -> b.getTotalAmount().compareTo(a.getTotalAmount()));
        return result;
    }
}
