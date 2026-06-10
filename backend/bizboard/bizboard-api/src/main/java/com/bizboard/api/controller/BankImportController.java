package com.bizboard.api.controller;

import com.bizboard.common.dto.BankImportDtos.*;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.BankImportService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.8 / §5) — banka import (manuel satır iskeleti) API.
 * PDF auto-parse ERTELENDİ (KARAR A4); bugün elle satır girişi.
 *
 * <ul>
 *   <li>{@code GET  /bank-imports?business_id=}                 — parti listesi</li>
 *   <li>{@code POST /bank-imports?business_id=}                 — parti aç</li>
 *   <li>{@code GET  /bank-imports/{batchId}?business_id=}       — parti + satırlar</li>
 *   <li>{@code POST /bank-imports/{batchId}/lines?business_id=} — elle satır ekle</li>
 *   <li>{@code POST /bank-imports/lines/{lineId}/categorize?business_id=} — kategori onayla</li>
 *   <li>{@code POST /bank-imports/lines/{lineId}/flag?business_id=}       — açıklanamayan (FLAGGED)</li>
 *   <li>{@code POST /bank-imports/lines/{lineId}/post?business_id=}       — ledger'a postala</li>
 * </ul>
 */
@RestController
@RequestMapping("/bank-imports")
@RequiredArgsConstructor
public class BankImportController {

    private final BankImportService service;

    @GetMapping
    public ResponseEntity<?> listBatches(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId) {
        try {
            return ResponseEntity.ok(service.listBatches(principal.getId(), businessId));
        } catch (SecurityException e) {
            return notFound();
        }
    }

    @PostMapping
    public ResponseEntity<?> createBatch(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @Valid @RequestBody CreateBatchRequest req) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.createBatch(principal.getId(), businessId, req));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @GetMapping("/{batchId}")
    public ResponseEntity<?> getBatch(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID batchId) {
        try {
            return ResponseEntity.ok(service.getBatch(principal.getId(), businessId, batchId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return notFound();
        }
    }

    @PostMapping("/{batchId}/lines")
    public ResponseEntity<?> addLine(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID batchId,
            @Valid @RequestBody AddLineRequest req) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.addLine(principal.getId(), businessId, batchId, req));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/lines/{lineId}/categorize")
    public ResponseEntity<?> categorize(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID lineId,
            @Valid @RequestBody CategorizeLineRequest req) {
        try {
            return ResponseEntity.ok(service.categorizeLine(principal.getId(), businessId, lineId, req));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/lines/{lineId}/flag")
    public ResponseEntity<?> flag(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID lineId) {
        try {
            return ResponseEntity.ok(service.flagLine(principal.getId(), businessId, lineId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/lines/{lineId}/post")
    public ResponseEntity<?> post(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable UUID lineId) {
        try {
            return ResponseEntity.ok(service.postLine(principal.getId(), businessId, lineId));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Yetki yok"));
    }

    private ResponseEntity<?> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Bulunamadı"));
    }
}
