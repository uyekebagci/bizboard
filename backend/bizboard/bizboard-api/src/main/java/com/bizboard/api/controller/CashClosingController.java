package com.bizboard.api.controller;

import com.bizboard.common.dto.BackdateClosingRequest;
import com.bizboard.common.dto.CashClosingDto;
import com.bizboard.common.dto.CloseTodayRequest;
import com.bizboard.common.dto.PagedResponseDto;
import com.bizboard.common.dto.ReopenClosingRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.CashClosingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * v1.6.19 (WP-2): Günlük kasa kapanışı endpoint'leri.
 *
 * <p>Endpoint listesi:</p>
 * <ul>
 *   <li>{@code GET /closings} — paginated geçmiş</li>
 *   <li>{@code GET /closings/today} — bugünün durumu (var ise kayıt, yoksa preview)</li>
 *   <li>{@code GET /closings/preview} — bugün için real-time computed</li>
 *   <li>{@code GET /closings/yesterday} — dünün kapanışı (Dünden Kalan Eksik widget'ı için)</li>
 *   <li>{@code POST /closings/today} — kullanıcı kapatır (idempotent değil — zaten CLOSED ise 409)</li>
 *   <li>{@code POST /closings/{id}/reopen} — admin override</li>
 * </ul>
 */
@RestController
@RequestMapping("/closings")
@RequiredArgsConstructor
public class CashClosingController {

    private final CashClosingService service;

    @GetMapping
    public ResponseEntity<?> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        try {
            return ResponseEntity.ok(PagedResponseDto.of(
                    service.list(principal.getId(), businessId, page, size)));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Kapanışlar bulunamadi"));
        }
    }

    @GetMapping("/today")
    public ResponseEntity<?> today(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId) {
        try {
            return service.getToday(principal.getId(), businessId)
                    .map(d -> (ResponseEntity<?>) ResponseEntity.ok(d))
                    .orElseGet(() -> ResponseEntity.noContent().build());
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Kapanış bulunamadi"));
        }
    }

    @GetMapping("/yesterday")
    public ResponseEntity<?> yesterday(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId) {
        try {
            return service.getYesterday(principal.getId(), businessId)
                    .map(d -> (ResponseEntity<?>) ResponseEntity.ok(d))
                    .orElseGet(() -> ResponseEntity.noContent().build());
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Kapanış bulunamadi"));
        }
    }

    @GetMapping("/preview")
    public ResponseEntity<?> preview(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId) {
        try {
            return ResponseEntity.ok(service.getTodayPreview(principal.getId(), businessId));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "İşletme bulunamadi"));
        }
    }

    @PostMapping("/today")
    public ResponseEntity<?> closeToday(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @Valid @RequestBody CloseTodayRequest req) {
        try {
            CashClosingDto result = service.closeToday(principal.getId(), businessId, req);
            return ResponseEntity.status(HttpStatus.CREATED).body(result);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "İşletme bulunamadi"));
        }
    }

    /**
     * v1.6.23.4 (BUG-2 fix): Geçmiş tarih için kapanış oluştur veya günceller.
     * Admin-only.
     *
     * <p>Davranış:
     * <ul>
     *   <li>{@code closing_date} body'de verilir (geçmiş ya da bugün)</li>
     *   <li>Mevcut CLOSED varsa {@code override=true} gerekli (yoksa 409)</li>
     *   <li>Audit log entry: highlight=BACKDATED_CLOSING</li>
     * </ul>
     */
    @PostMapping
    public ResponseEntity<?> closeBackdate(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @Valid @RequestBody BackdateClosingRequest req) {
        try {
            CashClosingDto result = service.closeBackdate(principal.getId(), businessId, req);
            return ResponseEntity.status(HttpStatus.CREATED).body(result);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "İşletme bulunamadi"));
        }
    }

    @PostMapping("/{closingId}/reopen")
    public ResponseEntity<CashClosingDto> reopen(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID closingId,
            @Valid @RequestBody ReopenClosingRequest req) {
        return ResponseEntity.ok(service.reopen(principal.getId(), closingId, req));
    }
}
