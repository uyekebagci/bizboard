package com.bizboard.api.controller;

import com.bizboard.common.dto.DayCloseEditCreateRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.DayCloseEditService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §4.2) — finalize kapanış ONAYLI düzenleme akışı API.
 *
 * <ul>
 *   <li>{@code GET  /day-close-edits?business_id=&status=}  — istek listesi</li>
 *   <li>{@code POST /day-close-edits?business_id=}          — düzenleme önerisi aç (PENDING)</li>
 *   <li>{@code POST /day-close-edits/{id}/approve?business_id=} — onayla+uygula</li>
 *   <li>{@code POST /day-close-edits/{id}/reject?business_id=}  — reddet</li>
 * </ul>
 *
 * <p>Tümü admin-only (service enforce eder) + zorunlu gerekçe + audit.</p>
 */
@RestController
@RequestMapping("/day-close-edits")
@RequiredArgsConstructor
public class DayCloseEditController {

    private final DayCloseEditService service;

    @GetMapping
    public ResponseEntity<?> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(name = "status", required = false) String status) {
        try {
            return ResponseEntity.ok(service.list(principal.getId(), businessId, status));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping
    public ResponseEntity<?> request(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @Valid @RequestBody DayCloseEditCreateRequest req) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.request(principal.getId(), businessId, req));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approve(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.approve(principal.getId(), id));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<?> reject(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, String> body) {
        try {
            String note = body != null ? body.get("reject_note") : null;
            return ResponseEntity.ok(service.reject(principal.getId(), id, note));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
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
