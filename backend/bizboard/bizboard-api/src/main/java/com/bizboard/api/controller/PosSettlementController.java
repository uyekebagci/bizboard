package com.bizboard.api.controller;

import com.bizboard.common.dto.FinalizeSettlementRequest;
import com.bizboard.common.dto.PosSettlementBatchDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.PosSettlementBatchService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.5 / TODO 2) — T+1 POS yatış (ortalama komisyon) finalize.
 *
 * <ul>
 *   <li>{@code GET  /pos-settlements?business_id=}          — settlement batch'leri</li>
 *   <li>{@code GET  /pos-settlements/pending?business_id=}  — yatış bekleyen gün+cihaz</li>
 *   <li>{@code POST /pos-settlements/finalize?business_id=} — yatış gir → ort.kom + final adjust</li>
 * </ul>
 */
@RestController
@RequestMapping("/pos-settlements")
@RequiredArgsConstructor
public class PosSettlementController {

    private final PosSettlementBatchService service;

    @GetMapping
    public ResponseEntity<?> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId) {
        try {
            return ResponseEntity.ok(service.list(principal.getId(), businessId));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @GetMapping("/pending")
    public ResponseEntity<?> pending(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId) {
        try {
            return ResponseEntity.ok(service.pendingSettlements(principal.getId(), businessId));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/finalize")
    public ResponseEntity<?> finalizeSettlement(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @Valid @RequestBody FinalizeSettlementRequest req) {
        try {
            PosSettlementBatchDto dto = service.finalizeSettlement(principal.getId(), businessId, req);
            return ResponseEntity.ok(dto);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Yetki yok"));
    }
}
