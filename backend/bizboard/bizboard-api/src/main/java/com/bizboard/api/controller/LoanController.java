package com.bizboard.api.controller;

import com.bizboard.common.dto.CreateLoanRequest;
import com.bizboard.common.dto.LoanResponseDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.LoanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Çatı v1.2 — Verilen/Alınan Borç (LOAN) endpoint'i.
 *
 * <p>Path-scoped (arch-rules §1.3 A): {@code POST /businesses/{businessId}/loans}.
 * Service ilk satırda {@code assertCanAccessBusiness} çağırır (defense-in-depth).</p>
 */
@RestController
@RequiredArgsConstructor
public class LoanController {

    private final LoanService loanService;

    /**
     * Verilen/Alınan Borç oluştur: kasa hareketi (kind=LOAN, P&L'e girmez) +
     * alacak/verecek ({@code Debt}) kaydı. Geri ödeme MEVCUT cari ödeme akışıyla
     * ({@code POST /counterparts/{id}/payments}) yapılır.
     */
    @PostMapping("/businesses/{businessId}/loans")
    public ResponseEntity<LoanResponseDto> createLoan(
            @PathVariable UUID businessId,
            @Valid @RequestBody CreateLoanRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(loanService.createLoan(businessId, request, principal.getId()));
    }
}
