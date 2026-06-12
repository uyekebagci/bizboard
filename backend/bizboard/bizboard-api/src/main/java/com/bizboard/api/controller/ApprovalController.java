package com.bizboard.api.controller;

import com.bizboard.common.dto.ApprovalDecisionRequest;
import com.bizboard.common.dto.ApprovalDto;
import com.bizboard.common.dto.ApprovalVerifyCodeRequest;
import com.bizboard.common.dto.BulkApproveRequest;
import com.bizboard.common.dto.CreateApprovalRequest;
import com.bizboard.common.enums.ApprovalStatus;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.approval.ApprovalService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Onay (Approval) modülü v1.1 — Onay Kuyruğu API'si.
 *
 * <p>6 mutating uç: create / approve / reject / cancel / bulk-approve /
 * verify-code; + list + detay (Onay Kuyruğu UI'si için). Tüm uçlar
 * <b>ADMIN-only</b> (yetki burada kesilir) + servis ayrıca STRICT tenant
 * izolasyonu uygular (kullanıcı yalnız erişebildiği işletmenin onaylarını
 * görür/yönetir).</p>
 *
 * <p>Hata haritası: cross-tenant → 404 (existence reveal kapalı); terminal
 * durum / TTL / kod gerekli → 409; validasyon → 400.</p>
 */
@RestController
@RequestMapping("/approvals")
@RequiredArgsConstructor
public class ApprovalController {

    private final ApprovalService service;

    // ─────────────────────────── LIST + DETAIL ─────────────────────────────

    /** Onay Kuyruğu — erişilebilir işletmelerin onayları (status filtre opsiyonel). */
    @GetMapping
    public ResponseEntity<?> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "status", required = false) String status) {
        if (!isAdmin(principal)) return forbidden();
        ApprovalStatus filter = parseStatus(status);
        List<ApprovalDto> rows = service.list(principal.getId(), filter);
        return ResponseEntity.ok(rows);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> detail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        if (!isAdmin(principal)) return forbidden();
        try {
            return ResponseEntity.ok(service.getOne(id, principal.getId()));
        } catch (SecurityException e) {
            return notFound();
        } catch (IllegalArgumentException e) {
            return notFound();
        }
    }

    // ─────────────────────────── CREATE ────────────────────────────────────

    @PostMapping
    public ResponseEntity<?> create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateApprovalRequest req) {
        if (!isAdmin(principal)) return forbidden();
        try {
            ApprovalDto dto = service.create(
                    req.getBusinessId(), req.getActionType(), req.getTitle(),
                    req.getPayload(), req.isRequireVerifyCode(),
                    req.getExpiresInMinutes(), principal.getId());
            return ResponseEntity.status(HttpStatus.CREATED).body(dto);
        } catch (SecurityException e) {
            return notFound();
        } catch (IllegalArgumentException e) {
            return badRequest(e);
        }
    }

    // ─────────────────────────── APPROVE ───────────────────────────────────

    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approve(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @RequestBody(required = false) @Valid ApprovalDecisionRequest req) {
        if (!isAdmin(principal)) return forbidden();
        try {
            String note = req != null ? req.getReason() : null;
            return ResponseEntity.ok(service.approve(id, note, principal.getId()));
        } catch (SecurityException e) {
            return notFound();
        } catch (IllegalStateException e) {
            return conflict(e);
        } catch (IllegalArgumentException e) {
            return badRequest(e);
        }
    }

    // ─────────────────────────── REJECT ────────────────────────────────────

    @PostMapping("/{id}/reject")
    public ResponseEntity<?> reject(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @RequestBody(required = false) @Valid ApprovalDecisionRequest req) {
        if (!isAdmin(principal)) return forbidden();
        try {
            String reason = req != null ? req.getReason() : null;
            return ResponseEntity.ok(service.reject(id, reason, principal.getId()));
        } catch (SecurityException e) {
            return notFound();
        } catch (IllegalStateException e) {
            return conflict(e);
        } catch (IllegalArgumentException e) {
            return badRequest(e);
        }
    }

    // ─────────────────────────── CANCEL ────────────────────────────────────

    @PostMapping("/{id}/cancel")
    public ResponseEntity<?> cancel(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @RequestBody(required = false) @Valid ApprovalDecisionRequest req) {
        if (!isAdmin(principal)) return forbidden();
        try {
            String note = req != null ? req.getReason() : null;
            return ResponseEntity.ok(service.cancel(id, note, principal.getId()));
        } catch (SecurityException e) {
            return notFound();
        } catch (IllegalStateException e) {
            return conflict(e);
        } catch (IllegalArgumentException e) {
            return badRequest(e);
        }
    }

    // ─────────────────────────── BULK APPROVE ──────────────────────────────

    @PostMapping("/bulk-approve")
    public ResponseEntity<?> bulkApprove(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody BulkApproveRequest req) {
        if (!isAdmin(principal)) return forbidden();
        try {
            List<Map<String, Object>> results =
                    service.bulkApprove(req.getIds(), req.getReason(), principal.getId());
            return ResponseEntity.ok(Map.of("results", results));
        } catch (IllegalArgumentException e) {
            return badRequest(e);
        }
    }

    // ─────────────────────────── VERIFY CODE ───────────────────────────────

    @PostMapping("/{id}/verify-code")
    public ResponseEntity<?> verifyCode(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody ApprovalVerifyCodeRequest req) {
        if (!isAdmin(principal)) return forbidden();
        try {
            return ResponseEntity.ok(service.verifyCode(id, req.getCode(), principal.getId()));
        } catch (SecurityException e) {
            return notFound();
        } catch (IllegalStateException e) {
            return conflict(e);
        } catch (IllegalArgumentException e) {
            return badRequest(e);
        }
    }

    // ─────────────────────────── helpers ───────────────────────────────────

    private boolean isAdmin(UserPrincipal principal) {
        return principal != null && principal.isAdmin();
    }

    private ApprovalStatus parseStatus(String status) {
        if (status == null || status.isBlank()) return null;
        try {
            return ApprovalStatus.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null; // bilinmeyen status → filtresiz (hepsi)
        }
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("message", "Onay yönetimi yetkisi yalnızca yöneticidedir."));
    }

    private ResponseEntity<?> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("message", "Onay bulunamadı"));
    }

    private ResponseEntity<?> conflict(RuntimeException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", e.getMessage()));
    }

    private ResponseEntity<?> badRequest(RuntimeException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }
}
