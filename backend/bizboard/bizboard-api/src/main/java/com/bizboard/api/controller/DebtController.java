package com.bizboard.api.controller;

import com.bizboard.common.dto.CreateDebtRequest;
import com.bizboard.common.dto.DebtDto;
import com.bizboard.common.dto.DebtSummaryDto;
import com.bizboard.common.dto.UpdateDebtRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.DebtService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class DebtController {

    private final DebtService debtService;

    // ─── İşletmeye ait borçlar ─────────────────────────────────

    @GetMapping("/businesses/{businessId}/debts")
    public ResponseEntity<List<DebtDto>> getBusinessDebts(
            @PathVariable UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(debtService.getDebtsForBusiness(businessId, principal.getId()));
    }

    @PostMapping("/businesses/{businessId}/debts")
    public ResponseEntity<DebtDto> createDebt(
            @PathVariable UUID businessId,
            @Valid @RequestBody CreateDebtRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(debtService.createDebt(businessId, request, principal.getId()));
    }

    @GetMapping("/businesses/{businessId}/debts/summary")
    public ResponseEntity<DebtSummaryDto> getBusinessDebtSummary(
            @PathVariable UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(debtService.getBusinessDebtSummary(businessId, principal.getId()));
    }

    // ─── Tekil borç işlemleri ──────────────────────────────────

    @PutMapping("/debts/{debtId}")
    public ResponseEntity<DebtDto> updateDebt(
            @PathVariable UUID debtId,
            @Valid @RequestBody UpdateDebtRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(debtService.updateDebt(debtId, request, principal.getId()));
    }

    @PatchMapping("/debts/{debtId}/settle")
    public ResponseEntity<DebtDto> settleDebt(
            @PathVariable UUID debtId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(debtService.settleDebt(debtId, principal.getId()));
    }

    @DeleteMapping("/debts/{debtId}")
    public ResponseEntity<Void> deleteDebt(
            @PathVariable UUID debtId,
            @AuthenticationPrincipal UserPrincipal principal) {
        debtService.deleteDebt(debtId, principal.getId());
        return ResponseEntity.noContent().build();
    }

    // ─── Tüm borçlar (admin: tümü, viewer: erişebildikleri) ───

    @GetMapping("/debts")
    public ResponseEntity<List<DebtDto>> getUserDebts(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(debtService.getDebtsForUser(principal.getId()));
    }

    @GetMapping("/debts/summary")
    public ResponseEntity<DebtSummaryDto> getDebtSummary(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(debtService.getAllDebtSummary(principal.getId()));
    }

    // ─── Admin: Tüm borçlar (sadece admin) ─────────────────────

    @GetMapping("/admin/debts")
    public ResponseEntity<List<DebtDto>> getAllDebts(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(debtService.getAllDebts(principal.getId()));
    }
}
