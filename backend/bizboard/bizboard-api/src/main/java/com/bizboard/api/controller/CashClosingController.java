package com.bizboard.api.controller;

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
    public ResponseEntity<PagedResponseDto<CashClosingDto>> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(PagedResponseDto.of(service.list(page, size)));
    }

    @GetMapping("/today")
    public ResponseEntity<CashClosingDto> today(@AuthenticationPrincipal UserPrincipal principal) {
        return service.getToday()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/yesterday")
    public ResponseEntity<CashClosingDto> yesterday(@AuthenticationPrincipal UserPrincipal principal) {
        return service.getYesterday()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/preview")
    public ResponseEntity<Map<String, Object>> preview(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.getTodayPreview());
    }

    @PostMapping("/today")
    public ResponseEntity<CashClosingDto> closeToday(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CloseTodayRequest req) {
        try {
            CashClosingDto result = service.closeToday(principal.getId(), req);
            return ResponseEntity.status(HttpStatus.CREATED).body(result);
        } catch (IllegalStateException e) {
            // Idempotency reddi — zaten kapatılmış.
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
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
