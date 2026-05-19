package com.bizboard.api.controller;

import com.bizboard.common.dto.DebtDto;
import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.entity.Debt;
import com.bizboard.repository.DebtRepository;
import com.bizboard.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * v1.6.22 (WP-5): Çek listeleme + yaklaşan vadeler endpoint'i.
 *
 * <p>{@code GET /cheques?from=&to=} — verilen aralıkta vadeli açık çekler.
 * Varsayılan: bugün → bugün + 30 gün.</p>
 *
 * <p>Çek = {@code receivable_type=CEK} olan ya da {@code instrument_type=CEK} olan
 * debt kayıtları + {@code cheque_due_date} dolu olanlar. Repository
 * {@code findUpcomingCheques} her ikisini de yakalar (cheque_due_date filtreli).</p>
 */
@RestController
@RequestMapping("/cheques")
@RequiredArgsConstructor
public class ChequeController {

    private final DebtRepository debtRepository;

    @GetMapping
    public ResponseEntity<List<DebtDto>> upcoming(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        LocalDate today = LocalDate.now();
        LocalDate fromDate = from != null ? from : today;
        LocalDate toDate = to != null ? to : today.plusDays(30);
        List<Debt> cheques = debtRepository.findUpcomingCheques(fromDate, toDate);
        return ResponseEntity.ok(cheques.stream().map(ChequeController::toDto).toList());
    }

    private static DebtDto toDto(Debt d) {
        Counterpart cp = d.getCounterpartRef();
        return com.bizboard.common.dto.DebtDto.builder()
                .id(d.getId())
                .businessId(d.getBusiness() != null ? d.getBusiness().getId() : null)
                .businessName(d.getBusiness() != null ? d.getBusiness().getName() : null)
                .direction(d.getDirection() != null ? d.getDirection().name() : null)
                .counterparty(d.getCounterparty())
                .counterpartId(cp != null ? cp.getId() : null)
                .counterpartName(cp != null ? cp.getName() : null)
                .amount(d.getAmount())
                .currency(d.getCurrency())
                .instrumentType(d.getInstrumentType())
                .receivableType(d.getReceivableType())
                .receivableTypeOther(d.getReceivableTypeOther())
                .chequeDueDate(d.getChequeDueDate())
                .chequeCollectorBank(d.getChequeCollectorBank())
                .chequeNo(d.getChequeNo())
                .reminderDate(d.getReminderDate())
                .reminderNote(d.getReminderNote())
                .dueDate(d.getDueDate())
                .settled(d.isSettled())
                .settledAt(d.getSettledAt())
                .description(d.getDescription())
                .documentUrl(d.getDocumentUrl())
                .adminOnly(d.isAdminOnly())
                .createdByName(d.getCreatedBy() != null ? d.getCreatedBy().getFullName() : null)
                .createdAt(d.getCreatedAt())
                .build();
    }
}
