package com.bizboard.api.controller;

import com.bizboard.common.dto.*;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.PhoneDeviceService;
import com.bizboard.service.PhoneMasterDataLoader;
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
 * v1.6.23.12 (WP 3c8401f6): Telefon takibi endpoint'leri.
 *
 * <p>3 grup: /phone-brands (master), /phone-models (master, cascading),
 * /phone-devices (CRUD + bank subresource).</p>
 *
 * <p>Master endpoint'ler {@code GET} ile authenticated user — UI dropdown'larını
 * doldurur. Cache yok (master 10 dk in-memory cache TODO #2 notu — future).</p>
 */
@RestController
@RequiredArgsConstructor
public class PhoneController {

    private final PhoneDeviceService service;
    private final PhoneMasterDataLoader masterLoader;

    // ── BRANDS ────────────────────────────────────────────────

    @GetMapping("/phone-brands")
    public ResponseEntity<List<PhoneBrandDto>> listBrands(
            @RequestParam(name = "include_inactive", defaultValue = "false") boolean includeInactive) {
        return ResponseEntity.ok(service.listBrands(includeInactive));
    }

    // ── MODELS ────────────────────────────────────────────────

    @GetMapping("/phone-models")
    public ResponseEntity<List<PhoneModelDto>> listModels(
            @RequestParam(name = "brand_id", required = false) UUID brandId,
            @RequestParam(name = "include_inactive", defaultValue = "false") boolean includeInactive) {
        return ResponseEntity.ok(service.listModels(brandId, includeInactive));
    }

    @GetMapping("/phone-brands/{brandId}/models")
    public ResponseEntity<List<PhoneModelDto>> listModelsByBrand(
            @PathVariable UUID brandId,
            @RequestParam(name = "include_inactive", defaultValue = "false") boolean includeInactive) {
        return ResponseEntity.ok(service.listModels(brandId, includeInactive));
    }

    // ── DEVICES ───────────────────────────────────────────────

    /**
     * v1.6.23.20 (Security WP TODO 15b1dd12): multi-tenant filter.
     * USER yalnız erişebildiği işletmelerin telefonlarını görür; ADMIN hepsi.
     */
    @GetMapping("/phone-devices")
    public ResponseEntity<List<PhoneDeviceDto>> listDevices(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id", required = false) UUID businessId,
            @RequestParam(name = "include_inactive", defaultValue = "false") boolean includeInactive) {
        return ResponseEntity.ok(service.listDevices(businessId, includeInactive, principal.getId()));
    }

    @PostMapping("/phone-devices")
    public ResponseEntity<?> createDevice(
            @Valid @RequestBody CreatePhoneDeviceRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.create(req, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "Access denied"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PatchMapping("/phone-devices/{id}")
    public ResponseEntity<?> updateDevice(
            @PathVariable UUID id,
            @Valid @RequestBody UpdatePhoneDeviceRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            return ResponseEntity.ok(service.update(id, req, principal.getId()));
        } catch (SecurityException e) {
            // Existence reveal kapalı — 404 dön.
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Phone device bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @DeleteMapping("/phone-devices/{id}")
    public ResponseEntity<?> deleteDevice(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            service.softDelete(id, principal.getId());
            return ResponseEntity.noContent().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Phone device bulunamadi"));
        }
    }

    // ── DEVICE BANKS (subresource) ────────────────────────────

    @PostMapping("/phone-devices/{id}/banks")
    public ResponseEntity<?> addBank(
            @PathVariable UUID id,
            @Valid @RequestBody PhoneDeviceBankDto req,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            return ResponseEntity.ok(service.addBank(id, req, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Phone device bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @DeleteMapping("/phone-devices/{id}/banks/{bankName}")
    public ResponseEntity<?> removeBank(
            @PathVariable UUID id,
            @PathVariable String bankName,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            return ResponseEntity.ok(service.removeBank(id, bankName, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Phone device bulunamadi"));
        }
    }

    // ── COUNTERPART expand (for /counterparts/{id}/phones) ────

    @GetMapping("/counterparts/{counterpartId}/phones")
    public ResponseEntity<List<PhoneDeviceDto>> listByCounterpart(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID counterpartId) {
        return ResponseEntity.ok(service.listByCounterpart(counterpartId, principal.getId()));
    }

    // ── ADMIN: master data reload ─────────────────────────────

    @PostMapping("/phone-master-data/reload")
    public ResponseEntity<?> reloadMasterData(@AuthenticationPrincipal UserPrincipal principal) {
        if (!principal.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "Sadece admin reload edebilir"));
        }
        masterLoader.reload();
        return ResponseEntity.ok(Map.of("status", "reloaded"));
    }
}
