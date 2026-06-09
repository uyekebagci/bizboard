package com.bizboard.api.controller;

import com.bizboard.common.dto.*;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.MyCompanyAccessService;
import com.bizboard.service.MyCompanyGroupService;
import com.bizboard.service.MyCompanyService;
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
 * v1.7.x WP 8b961444: Firmalarım (MyCompany) — admin + non-admin endpoints.
 *
 * <ul>
 *   <li>{@code /firms} — list (admin: tümü, non-admin: erişim-filtreli)</li>
 *   <li>{@code /firms/groups} — grup CRUD (admin-only via service)</li>
 *   <li>{@code /firms/{id}/access/users} — per-firm access CRUD (admin-only)</li>
 * </ul>
 *
 * <p>Cross-tenant: backend admin/non-admin ayrımı JWT'den; non-admin için
 * {@code my_company_user_access} kayıtları zorunlu. Admin her zaman tümünü görür.</p>
 */
@RestController
@RequestMapping("/firms")
@RequiredArgsConstructor
public class FirmsController {

    private final MyCompanyService service;
    private final MyCompanyGroupService groupService;
    private final MyCompanyAccessService accessService;

    // ─── List + detail + CRUD ──────────────────────────────────

    @GetMapping
    public ResponseEntity<List<MyCompanyDto>> list(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.listForUser(principal.getId(), principal.isAdmin()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<MyCompanyDto> get(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        // Non-admin için access kontrolü
        if (!principal.isAdmin()) {
            List<UUID> accessible = service.accessibleIds(principal.getId());
            if (!accessible.contains(id)) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
            }
        }
        return ResponseEntity.ok(service.get(id));
    }

    @PostMapping
    public ResponseEntity<?> create(
            @Valid @RequestBody CreateMyCompanyRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Admin yetkisi gerekli"));
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(req, principal.getId()));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> patch(
            @PathVariable UUID id,
            @RequestBody CreateMyCompanyRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Admin yetkisi gerekli"));
        }
        return ResponseEntity.ok(service.update(id, req, principal.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Admin yetkisi gerekli"));
        }
        service.delete(id, principal.getId());
        return ResponseEntity.noContent().build();
    }

    // ─── Groups CRUD (TODO 729ce168) ───────────────────────────

    @GetMapping("/groups")
    public ResponseEntity<List<MyCompanyGroupDto>> listGroups() {
        return ResponseEntity.ok(groupService.list());
    }

    @PostMapping("/groups")
    public ResponseEntity<?> createGroup(
            @Valid @RequestBody CreateMyCompanyGroupRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Admin yetkisi gerekli"));
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(groupService.create(req, principal.getId()));
    }

    @PatchMapping("/groups/{id}")
    public ResponseEntity<?> updateGroup(
            @PathVariable UUID id,
            @RequestBody CreateMyCompanyGroupRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Admin yetkisi gerekli"));
        }
        return ResponseEntity.ok(groupService.update(id, req, principal.getId()));
    }

    @DeleteMapping("/groups/{id}")
    public ResponseEntity<?> deleteGroup(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Admin yetkisi gerekli"));
        }
        groupService.delete(id, principal.getId());
        return ResponseEntity.noContent().build();
    }

    // ─── Access CRUD (TODO 515755d1) ───────────────────────────

    @GetMapping("/{firmId}/access/users")
    public ResponseEntity<?> listAccess(
            @PathVariable UUID firmId,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Admin yetkisi gerekli"));
        }
        return ResponseEntity.ok(accessService.list(firmId));
    }

    /** TODO 422595dd: bulk-select kaynağı — sadece user_id listesi. */
    @GetMapping("/{firmId}/access/users/ids")
    public ResponseEntity<?> listAccessIds(
            @PathVariable UUID firmId,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Admin yetkisi gerekli"));
        }
        return ResponseEntity.ok(Map.of("user_ids", accessService.listUserIds(firmId)));
    }

    @PostMapping("/{firmId}/access/users")
    public ResponseEntity<?> grantAccess(
            @PathVariable UUID firmId,
            @RequestBody Map<String, List<UUID>> body,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Admin yetkisi gerekli"));
        }
        List<UUID> userIds = body.get("user_ids");
        if (userIds == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "user_ids zorunlu"));
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(accessService.grantBulk(firmId, userIds, principal.getId()));
    }

    @DeleteMapping("/{firmId}/access/users/{userId}")
    public ResponseEntity<?> revokeAccess(
            @PathVariable UUID firmId,
            @PathVariable UUID userId,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Admin yetkisi gerekli"));
        }
        accessService.revoke(firmId, userId, principal.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{firmId}/access/users/bulk-revoke")
    public ResponseEntity<?> bulkRevoke(
            @PathVariable UUID firmId,
            @RequestBody Map<String, List<UUID>> body,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Admin yetkisi gerekli"));
        }
        List<UUID> userIds = body.get("user_ids");
        if (userIds == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "user_ids zorunlu"));
        }
        int removed = accessService.revokeBulk(firmId, userIds, principal.getId());
        return ResponseEntity.ok(Map.of("removed", removed));
    }

    @PostMapping("/{firmId}/access/clear")
    public ResponseEntity<?> clearAccess(
            @PathVariable UUID firmId,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Admin yetkisi gerekli"));
        }
        int removed = accessService.clearAll(firmId, principal.getId());
        return ResponseEntity.ok(Map.of("removed", removed));
    }
}
