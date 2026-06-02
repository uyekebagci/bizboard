package com.bizboard.api.controller;

import com.bizboard.common.dto.CreateDebtWriteoffRequest;
import com.bizboard.common.dto.DebtWriteoffDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.DebtWriteoffService;
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
 * WP a9da4e9d (Beta v1.1 · Borçlar): Borç silme endpoint'leri.
 *
 * <ul>
 *   <li>POST /debts/{debtId}/writeoff — ADMIN: ödeme almadan manuel düşüm</li>
 *   <li>GET /counterparts/{cpId}/writeoffs — herkes okur (business scoped)</li>
 *   <li>DELETE /debt-writeoffs/{id} — ADMIN: reverse</li>
 * </ul>
 */
@RestController
@RequiredArgsConstructor
public class DebtWriteoffController {

    private final DebtWriteoffService service;

    @PostMapping("/debts/{debtId}/writeoff")
    public ResponseEntity<?> writeOff(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID debtId,
            @Valid @RequestBody CreateDebtWriteoffRequest req) {
        try {
            DebtWriteoffDto dto = service.writeOff(debtId, req, principal.getId());
            return ResponseEntity.status(HttpStatus.CREATED).body(dto);
        } catch (SecurityException e) {
            // ADMIN guard — 403
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/counterparts/{counterpartId}/writeoffs")
    public ResponseEntity<?> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID counterpartId) {
        try {
            List<DebtWriteoffDto> items = service.listByCounterpart(counterpartId, principal.getId());
            return ResponseEntity.ok(items);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Counterpart bulunamadı"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", e.getMessage()));
        }
    }

    @DeleteMapping("/debt-writeoffs/{id}")
    public ResponseEntity<?> reverse(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID id) {
        try {
            service.reverseWriteoff(id, principal.getId());
            return ResponseEntity.noContent().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", e.getMessage()));
        }
    }
}
