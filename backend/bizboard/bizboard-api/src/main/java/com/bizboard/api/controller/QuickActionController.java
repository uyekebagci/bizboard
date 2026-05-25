package com.bizboard.api.controller;

import com.bizboard.common.dto.CreateQuickActionRequest;
import com.bizboard.common.dto.ExecuteQuickActionRequest;
import com.bizboard.common.dto.QuickActionDto;
import com.bizboard.common.dto.UpdateQuickActionRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.QuickActionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * WP e4dc5271 (Beta v1.4): Hızlı İşlemler API.
 *
 * <ul>
 *   <li>GET    /quick-actions?business_id={bizId}</li>
 *   <li>POST   /quick-actions</li>
 *   <li>PATCH  /quick-actions/{id}</li>
 *   <li>DELETE /quick-actions/{id}</li>
 *   <li>POST   /quick-actions/{id}/execute</li>
 * </ul>
 *
 * <p>Tüm endpoint'ler JWT user_id'sini base alır — cross-tenant guard
 * service tarafında.</p>
 */
@RestController
@RequestMapping("/quick-actions")
@RequiredArgsConstructor
public class QuickActionController {

    private final QuickActionService service;

    @GetMapping
    public ResponseEntity<List<QuickActionDto>> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId) {
        try {
            return ResponseEntity.ok(service.list(principal.getId(), businessId));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(List.of());
        }
    }

    @PostMapping
    public ResponseEntity<?> create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateQuickActionRequest req) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.create(req, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(java.util.Map.of("message", "Access denied"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(java.util.Map.of("message", e.getMessage()));
        }
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateQuickActionRequest req) {
        try {
            return ResponseEntity.ok(service.update(id, req, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("message", "Hızlı işlem bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(java.util.Map.of("message", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        try {
            service.delete(id, principal.getId());
            return ResponseEntity.noContent().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("message", "Hızlı işlem bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("message", e.getMessage()));
        }
    }

    /**
     * Execute akışı — template + overrides → tx oluştur. Response:
     * {@code {quick_action, transaction|transfer}}.
     */
    @PostMapping("/{id}/execute")
    public ResponseEntity<?> execute(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @RequestBody(required = false) ExecuteQuickActionRequest req) {
        try {
            QuickActionService.ExecuteResult result = service.execute(id, req, principal.getId());
            java.util.Map<String, Object> body = new java.util.HashMap<>();
            body.put("quick_action", result.quickAction);
            if (result.transaction != null) body.put("transaction", result.transaction);
            if (result.transfer != null) body.put("transfer", result.transfer);
            return ResponseEntity.status(HttpStatus.CREATED).body(body);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("message", "Hızlı işlem bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(java.util.Map.of("message", e.getMessage()));
        }
    }
}
