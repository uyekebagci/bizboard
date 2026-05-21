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
        return ResponseEntity.ok(service.list(includeInactive));
    }

    @GetMapping("/{id}")
    public ResponseEntity<PosDeviceDto> get(@PathVariable UUID id) {
        return ResponseEntity.ok(service.get(id));
    }

    @PostMapping
    public ResponseEntity<PosDeviceDto> create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreatePosDeviceRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(req, principal.getId()));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<PosDeviceDto> update(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @Valid @RequestBody UpdatePosDeviceRequest req) {
        return ResponseEntity.ok(service.update(id, req, principal.getId()));
    }

    /** Soft delete (is_active=false). Tx referansları korunur. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        service.delete(id, principal.getId());
        return ResponseEntity.noContent().build();
    }

    /**
     * v1.6.23.13 (TODO 5cee5f99): POS device detayında tüm tx'leri listele.
     * Detay sayfası "Tüm İşlemler" listesini doldurur.
     */
    @GetMapping("/{id}/transactions")
    public ResponseEntity<List<com.bizboard.common.dto.TransactionDto>> deviceTransactions(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        return ResponseEntity.ok(service.getDeviceTransactions(id));
    }

    /**
     * v1.6.21 (WP-4): POS analytics — gün-gün çekim/komisyon/net/settled count.
     *
     * <p>{@code GET /pos-devices/analytics?from=2026-05-01&to=2026-05-20&deviceId=...}</p>
     */
    @GetMapping("/analytics")
    public ResponseEntity<PosAnalyticsDto> analytics(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(name = "deviceId", required = false) UUID deviceId) {
        return ResponseEntity.ok(analyticsService.analytics(from, to, deviceId));
    }
}
