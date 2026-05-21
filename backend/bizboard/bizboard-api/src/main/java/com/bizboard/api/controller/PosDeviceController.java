package com.bizboard.api.controller;

import com.bizboard.common.dto.CreatePosDeviceRequest;
import com.bizboard.common.dto.PosAnalyticsDto;
import com.bizboard.common.dto.PosDeviceDto;
import com.bizboard.common.dto.UpdatePosDeviceRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.PosAnalyticsService;
import com.bizboard.service.PosDeviceManagementService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * v1.6.20 (WP-3) listeleme + v1.6.21 (WP-4) full CRUD.
 *
 * <p>List read-only (tüm authenticated). CRUD (create/update/delete) admin-only —
 * Spring Security {@code /admin/**} kuralının dışında; servis tarafında ya da
 * kontrolcü tarafında ROLE_ADMIN check'i eklenebilir. Şu an audit her aksiyonu
 * iz bırakıyor.</p>
 */
@RestController
@RequestMapping("/pos-devices")
@RequiredArgsConstructor
public class PosDeviceController {

    private final PosDeviceManagementService service;
    private final PosAnalyticsService analyticsService;

    @GetMapping
    public ResponseEntity<List<PosDeviceDto>> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "include_inactive", defaultValue = "false") boolean includeInactive) {
        return ResponseEntity.ok(service.list(includeInactive, principal.getId()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.get(id, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", "POS cihazi bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", e.getMessage()));
        }
    }

    @PostMapping
    public ResponseEntity<?> create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreatePosDeviceRequest req) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.create(req, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(java.util.Map.of("error", "Access denied"));
        }
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody UpdatePosDeviceRequest req) {
        try {
            return ResponseEntity.ok(service.update(id, req, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", "POS cihazi bulunamadi"));
        }
    }

    /** Soft delete (is_active=false). Tx referansları korunur. */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        try {
            service.delete(id, principal.getId());
            return ResponseEntity.noContent().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", "POS cihazi bulunamadi"));
        }
    }

    /**
     * v1.6.23.13 (TODO 5cee5f99): POS device detayında tüm tx'leri listele.
     * Detay sayfası "Tüm İşlemler" listesini doldurur.
     */
    @GetMapping("/{id}/transactions")
    public ResponseEntity<?> deviceTransactions(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.getDeviceTransactions(id, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", "POS cihazi bulunamadi"));
        }
    }

    /**
     * v1.6.21 (WP-4): POS analytics — gün-gün çekim/komisyon/net/settled count.
     * v1.6.23.20: deviceId verilirse tenant guard; verilmezse actor'ın
     * erişebildiği TÜM device'ların analytics'i (servis tarafında filtreli).
     */
    @GetMapping("/analytics")
    public ResponseEntity<?> analytics(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(name = "deviceId", required = false) UUID deviceId) {
        try {
            return ResponseEntity.ok(analyticsService.analytics(from, to, deviceId, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", "POS cihazi bulunamadi"));
        }
    }
}
