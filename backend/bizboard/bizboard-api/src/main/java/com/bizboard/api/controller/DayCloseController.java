package com.bizboard.api.controller;

import com.bizboard.common.dto.CloseDayRequest;
import com.bizboard.common.dto.DayCloseDrillDownDto;
import com.bizboard.common.dto.DayCloseDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.DayCloseService;
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
 * Ledger v2 (Faz B, §4) — gün-kapanışı + mutabakat + kaçak omurgası API.
 *
 * <ul>
 *   <li>{@code GET  /day-closes?business_id=}                — geçmiş kapanışlar</li>
 *   <li>{@code GET  /day-closes/preview?business_id=&date=}  — canlı SAĞLAMA HESAP + sayım listesi</li>
 *   <li>{@code GET  /day-closes/{date}?business_id=}         — tek gün kapanışı</li>
 *   <li>{@code GET  /day-closes/{date}/drill-down?business_id=} — kaçak kaynağı</li>
 *   <li>{@code POST /day-closes?business_id=}                — finalize (çok-hesap sayım; backdated dahil)</li>
 *   <li>{@code POST /day-closes/{id}/reopen?business_id=}    — admin reopen</li>
 *   <li>{@code POST /day-closes/recompute?business_id=&from=} — devir zinciri yeniden hesap</li>
 * </ul>
 */
@RestController
@RequestMapping("/day-closes")
@RequiredArgsConstructor
public class DayCloseController {

    private final DayCloseService service;

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

    @GetMapping("/{date}/drill-down")
    public ResponseEntity<?> drillDown(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        try {
            DayCloseDrillDownDto dto = service.drillDown(principal.getId(), businessId, date);
            return ResponseEntity.ok(dto);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return notFound();
        }
    }

    @PostMapping
    public ResponseEntity<?> close(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @Valid @RequestBody CloseDayRequest req) {
        try {
            DayCloseDto result = service.closeDay(principal.getId(), businessId, req);
            return ResponseEntity.status(HttpStatus.CREATED).body(result);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "Yetki yok"));
        }
    }

    @PostMapping("/{id}/reopen")
    public ResponseEntity<?> reopen(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, String> body) {
        try {
            String note = body != null ? body.get("reason_note") : null;
            return ResponseEntity.ok(service.reopen(principal.getId(), id, note));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Yetki yok"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/recompute")
    public ResponseEntity<?> recompute(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(name = "from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from) {
        try {
            int touched = service.recomputeChainFrom(principal.getId(), businessId, from);
            return ResponseEntity.ok(Map.of("touched", touched, "from", from.toString()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Yetki yok"));
        }
    }

    private ResponseEntity<?> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("message", "Kapanış bulunamadı"));
    }
}
