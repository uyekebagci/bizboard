package com.bizboard.api.controller;

import com.bizboard.common.dto.CreatePosDealRequest;
import com.bizboard.common.dto.PosDealDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.PosDealService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.5 / §6 / TODO 1+4+7) — POS işlem (deal) girişi + kâr-payı.
 *
 * <ul>
 *   <li>{@code GET  /pos-deals?business_id=}                 — deal listesi</li>
 *   <li>{@code GET  /pos-deals/{id}?business_id=}            — tek deal + paylar</li>
 *   <li>{@code POST /pos-deals?business_id=}                 — deal gir (kâr-payı provisional)</li>
 *   <li>{@code POST /pos-deals/preview?business_id=}         — canlı pay önizleme (yazmaz)</li>
 *   <li>{@code POST /pos-deals/{id}/reverse?business_id=}    — admin geri al</li>
 * </ul>
 */
@RestController
@RequestMapping("/pos-deals")
@RequiredArgsConstructor
public class PosDealController {

    private final PosDealService service;

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
            @Valid @RequestBody CreatePosDealRequest req) {
        try {
            PosDealDto dto = service.createDeal(principal.getId(), businessId, req);
            return ResponseEntity.status(HttpStatus.CREATED).body(dto);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/preview")
    public ResponseEntity<?> preview(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @Valid @RequestBody CreatePosDealRequest req) {
        try {
            return ResponseEntity.ok(service.previewShares(principal.getId(), businessId, req));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/{id}/reverse")
    public ResponseEntity<?> reverse(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID id) {
        try {
            service.reverseDeal(principal.getId(), id);
            return ResponseEntity.ok(Map.of("status", "reversed", "id", id.toString()));
        } catch (IllegalArgumentException e) {
            return notFound(e.getMessage());
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
}
