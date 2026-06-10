package com.bizboard.api.controller;

import com.bizboard.common.dto.CashInstrumentRequest;
import com.bizboard.common.dto.CreateInstrumentRequest;
import com.bizboard.common.dto.EndorseInstrumentRequest;
import com.bizboard.common.dto.InstrumentDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.InstrumentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §3.7 / TODO 1) — çek/senet (Instrument) portföy + olayları.
 *
 * <ul>
 *   <li>{@code GET  /instruments?business_id=&status=}        — portföy listesi</li>
 *   <li>{@code GET  /instruments/{id}?business_id=}           — tek evrak</li>
 *   <li>{@code POST /instruments?business_id=}                — manuel giriş</li>
 *   <li>{@code POST /instruments/{id}/confirm?business_id=}   — OCR onayı</li>
 *   <li>{@code POST /instruments/{id}/cash?business_id=}      — tahsil/ödeme (Σ=0 posting)</li>
 *   <li>{@code POST /instruments/{id}/bounce?business_id=}    — karşılıksız</li>
 *   <li>{@code POST /instruments/{id}/endorse?business_id=}   — ciro/devir</li>
 * </ul>
 *
 * <p>Yeni kod — mevcut akışları (v1.7 PaymentInstrument /payments) DEĞİŞTİRMEZ.</p>
 */
@RestController
@RequestMapping("/instruments")
@RequiredArgsConstructor
public class InstrumentController {

    private final InstrumentService service;

    @GetMapping
    public ResponseEntity<?> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(required = false) String status) {
        try {
            return ResponseEntity.ok(service.list(principal.getId(), businessId, status));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.get(principal.getId(), businessId, id));
        } catch (IllegalArgumentException e) {
            return notFound(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping
    public ResponseEntity<?> create(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @Valid @RequestBody CreateInstrumentRequest req) {
        try {
            InstrumentDto dto = service.create(principal.getId(), businessId, req);
            return ResponseEntity.status(HttpStatus.CREATED).body(dto);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return badRequest(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/{id}/confirm")
    public ResponseEntity<?> confirm(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID id) {
        return mutate(() -> service.confirm(principal.getId(), businessId, id));
    }

    @PostMapping("/{id}/cash")
    public ResponseEntity<?> cash(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID id,
            @Valid @RequestBody CashInstrumentRequest req) {
        return mutate(() -> service.cash(principal.getId(), businessId, id, req));
    }

    @PostMapping("/{id}/bounce")
    public ResponseEntity<?> bounce(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID id) {
        return mutate(() -> service.bounce(principal.getId(), businessId, id));
    }

    @PostMapping("/{id}/endorse")
    public ResponseEntity<?> endorse(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID id,
            @Valid @RequestBody EndorseInstrumentRequest req) {
        return mutate(() -> service.endorse(principal.getId(), businessId, id, req));
    }

    // ── helpers ──

    private ResponseEntity<?> mutate(java.util.function.Supplier<InstrumentDto> action) {
        try {
            return ResponseEntity.ok(action.get());
        } catch (IllegalArgumentException e) {
            return notFound(e.getMessage());
        } catch (IllegalStateException e) {
            return badRequest(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Yetki yok"));
    }

    private ResponseEntity<?> notFound(String msg) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", msg));
    }

    private ResponseEntity<?> badRequest(String msg) {
        return ResponseEntity.badRequest().body(Map.of("message", msg));
    }
}
