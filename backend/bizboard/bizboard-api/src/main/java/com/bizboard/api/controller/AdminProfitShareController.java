package com.bizboard.api.controller;

import com.bizboard.common.dto.ProfitShareConfigDto;
import com.bizboard.common.dto.ProfitShareRuleRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.ProfitShareRuleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.4 / TODO 3) — POS kâr-payı kural + global config admin
 * yönetimi. {@code /admin/**} → SecurityConfig ADMIN role gate (defense-in-depth);
 * servis ayrıca admin doğrular.
 *
 * <ul>
 *   <li>{@code GET    /admin/profit-share/rules?business_id=}</li>
 *   <li>{@code POST   /admin/profit-share/rules?business_id=}        — yeni kural</li>
 *   <li>{@code PUT    /admin/profit-share/rules/{id}?business_id=}   — güncelle</li>
 *   <li>{@code DELETE /admin/profit-share/rules/{id}?business_id=}   — sil</li>
 *   <li>{@code GET    /admin/profit-share/config?business_id=}       — sahip%/Fatih%/Tuncay%</li>
 *   <li>{@code PUT    /admin/profit-share/config?business_id=}       — config güncelle</li>
 * </ul>
 */
@RestController
@RequestMapping("/admin/profit-share")
@RequiredArgsConstructor
public class AdminProfitShareController {

    private final ProfitShareRuleService service;

    @GetMapping("/rules")
    public ResponseEntity<?> listRules(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId) {
        try {
            return ResponseEntity.ok(service.listRules(principal.getId(), businessId));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/rules")
    public ResponseEntity<?> createRule(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @Valid @RequestBody ProfitShareRuleRequest req) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.upsertRule(principal.getId(), businessId, null, req));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PutMapping("/rules/{id}")
    public ResponseEntity<?> updateRule(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID id,
            @Valid @RequestBody ProfitShareRuleRequest req) {
        try {
            return ResponseEntity.ok(service.upsertRule(principal.getId(), businessId, id, req));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @DeleteMapping("/rules/{id}")
    public ResponseEntity<?> deleteRule(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID id) {
        try {
            service.deleteRule(principal.getId(), businessId, id);
            return ResponseEntity.ok(Map.of("status", "deleted", "id", id.toString()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @GetMapping("/config")
    public ResponseEntity<?> getConfig(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId) {
        try {
            return ResponseEntity.ok(service.getConfig(principal.getId(), businessId));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PutMapping("/config")
    public ResponseEntity<?> updateConfig(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestBody ProfitShareConfigDto req) {
        try {
            return ResponseEntity.ok(service.updateConfig(principal.getId(), businessId, req));
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
