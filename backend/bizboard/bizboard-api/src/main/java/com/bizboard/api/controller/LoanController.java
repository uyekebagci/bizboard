package com.bizboard.api.controller;

import com.bizboard.common.dto.CreateLoanRequest;
import com.bizboard.common.dto.DebtDto;
import com.bizboard.common.dto.LoanResponseDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.DebtService;
import com.bizboard.service.LoanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Çatı v1.2 — Verilen/Alınan Borç (LOAN) endpoint'i.
 *
 * <p>Path-scoped (arch-rules §1.3 A): {@code POST /businesses/{businessId}/loans}.
 * Service ilk satırda {@code assertCanAccessBusiness} çağırır (defense-in-depth).</p>
 *
 * <p>v1.1 (Krediler sayfası): salt-görüntü listeleme uçları eklendi. Kredi =
 * Verilen/Alınan Borç'un ürettiği {@code Debt} kaydı; listeleme mevcut
 * {@link DebtService} altyapısını (DTO + tenant guard) yeniden kullanır,
 * YENİ hesap/mutasyon üretmez.</p>
 */
@RestController
@RequiredArgsConstructor
public class LoanController {

    private final LoanService loanService;
    private final DebtService debtService;

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

    /** v1.1: bir işletmenin kredileri (salt görüntü). */
    @GetMapping("/businesses/{businessId}/loans")
    public ResponseEntity<List<DebtDto>> getBusinessLoans(
            @PathVariable UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(debtService.getLoansForBusiness(businessId, principal.getId()));
    }

    /** v1.1: kullanıcının erişebildiği tüm işletmelerin kredileri (konsolide, salt görüntü). */
    @GetMapping("/loans")
    public ResponseEntity<List<DebtDto>> getUserLoans(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(debtService.getLoansForUser(principal.getId()));
    }
}
