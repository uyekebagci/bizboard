package com.bizboard.api.controller;

import com.bizboard.common.dto.*;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.SubCashEntityType;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.CounterpartRepository;
import com.bizboard.repository.PosDeviceRepository;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.BankAccountService;
import com.bizboard.service.DtoMapper;
import com.bizboard.service.SubCashAggregateService;
import com.bizboard.service.SubCashService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.*;

/**
 * v1.6.23.27 (UI Fix WP TODO 7cc85a10 + df12d130 + 85a7e425):
 * Sub-Cash assignment endpoint'leri.
 *
 * <p>Path-scoped: {@code /bank-accounts/{subCashId}/assignments} — sub-cash
 * tenant izolasyonu service tarafında.</p>
 */
@RestController
@RequestMapping("/bank-accounts/{subCashId}")
@RequiredArgsConstructor
public class SubCashController {

    private final SubCashService subCashService;
    private final SubCashAggregateService aggregateService;
    private final BankAccountRepository bankAccountRepository;
    private final CounterpartRepository counterpartRepository;
    private final PosDeviceRepository posDeviceRepository;

    /**
     * v1.6.23.27 (TODO 85a7e425 + 31c441cb): Sub-cash detay aggregate.
     * Balance kartı + assignment listesi + tx listesi tek round-trip.
     */
    @GetMapping("/sub-cash-detail")
    public ResponseEntity<?> detail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID subCashId,
            @RequestParam(name = "tx_limit", defaultValue = "20") int txLimit) {
        try {
            BankAccount subCash = bankAccountRepository.findById(subCashId)
                    .orElseThrow(() -> new IllegalArgumentException("Sub-cash bulunamadi"));
            UUID bizId = subCash.getBusiness() != null ? subCash.getBusiness().getId() : null;
            // Access check ve eligibility — service çağrılarında zaten yapılıyor
            List<SubCashAssignment> assigns = subCashService.listForSubCash(subCashId, principal.getId());
            BigDecimal agg = aggregateService.subCashAggregate(subCashId);
            BigDecimal main = bizId != null ? aggregateService.mainAggregate(bizId) : BigDecimal.ZERO;
            BigDecimal unassigned = bizId != null ? aggregateService.unassignedAggregate(bizId) : BigDecimal.ZERO;

            List<SubCashAssignmentDto> assignDtos = assigns.stream()
                    .map(this::toAssignmentDto).toList();
            List<TransactionDto> txDtos = subCashService
                    .transactionsForSubCash(subCashId, principal.getId(), txLimit)
                    .stream().map(DtoMapper::toTransactionDto).toList();

            SubCashDetailDto detail = SubCashDetailDto.builder()
                    .subCash(BankAccountService.toDto(subCash, agg))
                    .aggregate(agg)
                    .mainAggregate(main)
                    .unassignedAggregate(unassigned)
                    .assignments(assignDtos)
                    .transactions(txDtos)
                    .build();
            return ResponseEntity.ok(detail);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Sub-cash bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    /** v1.6.23.27 (TODO 7cc85a10): Entity assign. */
    @PostMapping("/assignments")
    public ResponseEntity<?> assign(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID subCashId,
            @Valid @RequestBody CreateSubCashAssignmentRequest req) {
        try {
            SubCashEntityType type;
            try {
                type = SubCashEntityType.valueOf(req.getEntityType().trim().toUpperCase(Locale.ENGLISH));
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Gecersiz entity_type — COUNTERPART/POS_DEVICE/BANK_ACCOUNT olmali"));
            }
            SubCashAssignment a = subCashService.assign(subCashId, type, req.getEntityId(), principal.getId());
            return ResponseEntity.status(HttpStatus.CREATED).body(toAssignmentDto(a));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Sub-cash bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** v1.6.23.27 (TODO df12d130): Unassign — entity verisi etkilenmez. */
    @DeleteMapping("/assignments/{assignmentId}")
    public ResponseEntity<?> unassign(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID subCashId,
            @PathVariable UUID assignmentId) {
        try {
            subCashService.unassign(assignmentId, principal.getId());
            return ResponseEntity.noContent().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Atama bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        }
    }

    // ─────────────────────── helper ───────────────────────

    private SubCashAssignmentDto toAssignmentDto(SubCashAssignment a) {
        String name = "?";
        BigDecimal contribution = BigDecimal.ZERO;
        switch (a.getEntityType()) {
            case BANK_ACCOUNT -> {
                BankAccount ba = bankAccountRepository.findById(a.getEntityId()).orElse(null);
                if (ba != null) {
                    name = ba.getName();
                    if (SubCashAggregateService.isEligibleBankAccount(ba)
                            && ba.getCurrentBalance() != null) {
                        contribution = ba.getCurrentBalance();
                    }
                }
            }
            case COUNTERPART -> {
                Counterpart c = counterpartRepository.findById(a.getEntityId()).orElse(null);
                if (c != null) name = c.getName();
            }
            case POS_DEVICE -> {
                PosDevice p = posDeviceRepository.findById(a.getEntityId()).orElse(null);
                if (p != null) name = p.getName();
            }
        }
        return SubCashAssignmentDto.builder()
                .id(a.getId())
                .subCashId(a.getSubCash() != null ? a.getSubCash().getId() : null)
                .subCashName(a.getSubCash() != null ? a.getSubCash().getName() : null)
                .businessId(a.getBusiness() != null ? a.getBusiness().getId() : null)
                .entityType(a.getEntityType().name())
                .entityId(a.getEntityId())
                .entityName(name)
                .entityBalanceContribution(contribution)
                .assignedAt(a.getAssignedAt())
                .assignedBy(a.getAssignedBy())
                .build();
    }
}
