package com.bizboard.api.controller;

import com.bizboard.common.dto.*;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.AccountStatementService;
import com.bizboard.service.PaymentService;
import com.bizboard.common.entity.PaymentInstrument;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.UUID;

/**
 * v1.7.x WP fbb2ef55: Cari hesap ödeme + instrument lifecycle endpoint'leri.
 */
@RestController
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;
    private final AccountStatementService accountStatementService;

    // ── Payment create ──────────────────────────────────────────────
    @PostMapping("/counterparts/{counterpartId}/payments")
    public ResponseEntity<PaymentResponseDto> createPayment(
            @PathVariable UUID counterpartId,
            @Valid @RequestBody CreatePaymentRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(paymentService.createPayment(counterpartId, req, principal.getId()));
    }

    // ── Account statement (sayfayı tek shot besler) ──────────────────
    @GetMapping("/counterparts/{counterpartId}/account-statement")
    public ResponseEntity<AccountStatementDto> getAccountStatement(
            @PathVariable UUID counterpartId,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                accountStatementService.getAccountStatement(counterpartId, from, to, principal.getId()));
    }

    // ── Instrument lifecycle ────────────────────────────────────────
    @PostMapping("/payment-instruments/{id}/clear")
    public ResponseEntity<PaymentInstrumentDto> clearInstrument(
            @PathVariable UUID id,
            @Valid @RequestBody ClearInstrumentRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        PaymentInstrument inst = paymentService.clearInstrument(
                id, req.getBankAccountId(), req.getClearedAt(), principal.getId());
        return ResponseEntity.ok(AccountStatementService.toDto(inst));
    }

    @PostMapping("/payment-instruments/{id}/bounce")
    public ResponseEntity<PaymentInstrumentDto> bounceInstrument(
            @PathVariable UUID id,
            @RequestBody(required = false) BounceInstrumentRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        BounceInstrumentRequest body = req != null ? req : new BounceInstrumentRequest();
        PaymentInstrument inst = paymentService.bounceInstrument(
                id, body.getBouncedAt(), body.getReason(), principal.getId());
        return ResponseEntity.ok(AccountStatementService.toDto(inst));
    }

    @DeleteMapping("/payment-instruments/{id}")
    public ResponseEntity<Void> deleteInstrument(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        paymentService.deleteInstrument(id, principal.getId());
        return ResponseEntity.noContent().build();
    }
}
