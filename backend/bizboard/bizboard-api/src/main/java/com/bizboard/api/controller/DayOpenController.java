package com.bizboard.api.controller;

import com.bizboard.common.dto.DayOpenDto;
import com.bizboard.common.dto.DayStatusDto;
import com.bizboard.common.dto.OpenDayRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.DayOpenService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz B — Gün Açılışı) — gün AÇILIŞ state machine + devir yuvarlama API.
 *
 * <ul>
 *   <li>{@code GET  /day-opens?business_id=}                 — açılış geçmişi</li>
 *   <li>{@code GET  /day-opens/preview?business_id=&date=}   — hesap açılışları + otomatik devir</li>
 *   <li>{@code GET  /day-opens/status?business_id=&date=}    — birleşik durum + gating kararı</li>
 *   <li>{@code GET  /day-opens/{date}?business_id=}          — tek gün açılışı</li>
 *   <li>{@code POST /day-opens?business_id=}                 — "Günü Aç" (yuvarlama; backdated dahil)</li>
 *   <li>{@code DELETE /day-opens/{date}?business_id=}        — admin geri al (yuvarlama reverse)</li>
 * </ul>
 *
 * <p>{@code IllegalStateException} → 409 (gün KAPALI / zaten AÇIK);
 * {@code IllegalArgumentException} → 400; {@code SecurityException} → 403
 * ({@code GlobalExceptionHandler}).</p>
 */
@RestController
@RequestMapping("/day-opens")
@RequiredArgsConstructor
public class DayOpenController {

    private final DayOpenService service;

    @GetMapping
    public ResponseEntity<?> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId) {
        try {
            return ResponseEntity.ok(service.list(principal.getId(), businessId));
        } catch (SecurityException e) {
            return notFound();
        }
    }

    @GetMapping("/preview")
    public ResponseEntity<?> preview(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(name = "date", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        try {
            return ResponseEntity.ok(service.preview(principal.getId(), businessId, date));
        } catch (SecurityException e) {
            return notFound();
        }
    }

    @GetMapping("/status")
    public ResponseEntity<?> status(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(name = "date", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        try {
            DayStatusDto dto = service.status(principal.getId(), businessId, date);
            return ResponseEntity.ok(dto);
        } catch (SecurityException e) {
            return notFound();
        }
    }

    @GetMapping("/{date}")
    public ResponseEntity<?> get(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        try {
            return service.get(principal.getId(), businessId, date)
                    .<ResponseEntity<?>>map(ResponseEntity::ok)
                    .orElseGet(() -> ResponseEntity.noContent().build());
        } catch (SecurityException e) {
            return notFound();
        }
    }

    @PostMapping
    public ResponseEntity<?> open(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @Valid @RequestBody OpenDayRequest req) {
        try {
            DayOpenDto result = service.openDay(principal.getId(), businessId, req);
            return ResponseEntity.status(HttpStatus.CREATED).body(result);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Yetki yok"));
        }
    }

    @DeleteMapping("/{date}")
    public ResponseEntity<?> revert(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        try {
            service.revertOpen(principal.getId(), businessId, date);
            return ResponseEntity.ok(Map.of("reverted", true, "date", date.toString()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Yetki yok"));
        }
    }

    private ResponseEntity<?> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("message", "Açılış bulunamadı"));
    }
}
