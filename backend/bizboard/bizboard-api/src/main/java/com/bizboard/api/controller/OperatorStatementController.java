package com.bizboard.api.controller;

import com.bizboard.security.UserPrincipal;
import com.bizboard.service.OperatorStatementService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.11 / TODO 4+7) — operatör kâr-merkezi READ-ONLY statement.
 *
 * <p>Bu controller SADECE okuma sunar — operatör kasası manuel girişe kapalı
 * (POST/PUT/DELETE YOK). Bakiye = Σ(otomatik kâr) − Σ(ödeme).</p>
 *
 * <ul>
 *   <li>{@code GET /operator-statements?business_id=}            — operatör listesi + bakiyeler</li>
 *   <li>{@code GET /operator-statements/{accountId}?business_id=} — tek operatör statement (satırlı)</li>
 * </ul>
 */
@RestController
@RequestMapping("/operator-statements")
@RequiredArgsConstructor
public class OperatorStatementController {

    private final OperatorStatementService service;

    @GetMapping
    public ResponseEntity<?> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId) {
        try {
            return ResponseEntity.ok(service.listOperators(principal.getId(), businessId));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @GetMapping("/{accountId}")
    public ResponseEntity<?> statement(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID accountId) {
        try {
            return ResponseEntity.ok(service.statement(principal.getId(), businessId, accountId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Yetki yok"));
    }
}
