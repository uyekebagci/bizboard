package com.bizboard.api.controller;

import com.bizboard.common.dto.CounterpartDto;
import com.bizboard.common.dto.CounterpartStatementDto;
import com.bizboard.common.dto.CreateCounterpartRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.CounterpartLedgerService;
import com.bizboard.service.CounterpartService;
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
 * "Karşı Firmalar" CRUD. {@code /counterparts/**} authenticated kullanıcılar
 * için açık. (Cari hesap ekstre endpoint'i v1.5.1'de geliyor.)
 */
@RestController
@RequestMapping("/counterparts")
@RequiredArgsConstructor
public class CounterpartController {

    private final CounterpartService service;
    private final CounterpartLedgerService ledgerService;

    @GetMapping
    public ResponseEntity<List<CounterpartDto>> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String kind) {
        return ResponseEntity.ok(service.list(role, kind, principal.getId()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.get(id, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", "Karsi firma bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", e.getMessage()));
        }
    }

    /**
     * v1.6.20 (WP-3): Alt firmalar (children). Bir parent firmanın altındaki
     * tüm sub-firma'lar. Counterpart detay sayfası drill-down için.
     */
    @GetMapping("/{id}/children")
    public ResponseEntity<List<CounterpartDto>> children(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        return ResponseEntity.ok(service.children(id, principal.getId()));
    }

    @PostMapping
    public ResponseEntity<?> create(
            @Valid @RequestBody CreateCounterpartRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.create(request, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(java.util.Map.of("error", "Access denied"));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(
            @PathVariable UUID id,
            @Valid @RequestBody CreateCounterpartRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            return ResponseEntity.ok(service.update(id, request, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", "Karsi firma bulunamadi"));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            service.delete(id, principal.getId());
            return ResponseEntity.noContent().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", "Karsi firma bulunamadi"));
        }
    }

    /**
     * Cari hesap ekstresi. {@code from}/{@code to} ISO tarih, opsiyonel.
     * {@code from} verilmezse counterpart'ın ilk borcundan, {@code to} verilmezse
     * bugüne kadar.
     */
    @GetMapping("/{id}/statement")
    public ResponseEntity<?> statement(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        // v1.6.23.20: counterpart erişim kontrolü — statement leak'i kapatır.
        try {
            service.get(id, principal.getId());
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", "Karsi firma bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(java.util.Map.of("error", e.getMessage()));
        }
        return ResponseEntity.ok(ledgerService.getStatement(id, from, to));
    }
}

