package com.bizboard.api.controller;

import com.bizboard.common.dto.*;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.BusinessGroupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * v1.6.11: Kullanıcının kendi grupları için CRUD + reorder + üye yönetimi.
 *
 * Hepsi `{currentUser}` ile sınırlı — başka kullanıcının grubuna ulaşmak
 * 404/403 döner ({@link BusinessGroupService} `mustOwn` üzerinden).
 */
@RestController
@RequestMapping("/api/me/business-groups")
@RequiredArgsConstructor
public class BusinessGroupController {

    private final BusinessGroupService service;

    // ────────── GROUP CRUD ──────────

    @GetMapping
    public ResponseEntity<List<BusinessGroupDto>> list(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.listMyGroups(principal.getId()));
    }

    @PostMapping
    public ResponseEntity<BusinessGroupDto> create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateBusinessGroupRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createGroup(principal.getId(), req));
    }

    @PatchMapping("/{groupId}")
    public ResponseEntity<BusinessGroupDto> update(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID groupId,
            @Valid @RequestBody UpdateBusinessGroupRequest req) {
        return ResponseEntity.ok(service.updateGroup(principal.getId(), groupId, req));
    }

    @DeleteMapping("/{groupId}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID groupId) {
        service.deleteGroup(principal.getId(), groupId);
        return ResponseEntity.noContent().build();
    }

    // ────────── GROUP REORDER ──────────

    @PostMapping("/reorder")
    public ResponseEntity<List<BusinessGroupDto>> reorderGroups(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ReorderRequest req) {
        return ResponseEntity.ok(service.reorderGroups(principal.getId(), req.getIds()));
    }

    // ────────── MEMBER MANAGEMENT ──────────

    @PostMapping("/{groupId}/members")
    public ResponseEntity<BusinessGroupDto> addMember(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID groupId,
            @Valid @RequestBody AddGroupMemberRequest req) {
        return ResponseEntity.ok(service.addMember(principal.getId(), groupId, req));
    }

    @DeleteMapping("/{groupId}/members/{businessId}")
    public ResponseEntity<Void> removeMember(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID groupId,
            @PathVariable UUID businessId) {
        service.removeMember(principal.getId(), groupId, businessId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{groupId}/members/reorder")
    public ResponseEntity<BusinessGroupDto> reorderMembers(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID groupId,
            @Valid @RequestBody ReorderRequest req) {
        return ResponseEntity.ok(
                service.reorderMembers(principal.getId(), groupId, req.getIds()));
    }
}
