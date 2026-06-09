package com.bizboard.api.controller;

import com.bizboard.common.dto.CreateTransferRequest;
import com.bizboard.common.dto.TransferDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.TransferService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * v1.7.0-beta (Bankalar WP TODO abb90050 + 3993f396): Transfer endpoints.
 *
 * <ul>
 *   <li>{@code POST /transfers} — pair yarat (200 + low_balance_warning veya 400 validation)</li>
 *   <li>{@code GET /transfers/{pairId}} — pair detay (UI TransferDetailModal için)</li>
 *   <li>{@code DELETE /transfers/{pairId}} — pair'i atomic sil (balance reversal)</li>
 * </ul>
 *
 * <p>Tek-yön silme YASAK; {@code DELETE /transactions/{id}} bir TRANSFER tx'i
 * için 400 döner (TransactionService.delete guard'ı).</p>
 */
@RestController
@RequestMapping("/transfers")
@RequiredArgsConstructor
public class TransferController {

    private final TransferService service;

    @PostMapping
    public ResponseEntity<?> create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateTransferRequest req) {
        try {
            TransferDto dto = service.create(req, principal.getId());
            // Bakiye yetersizse 200 + warning (block değil — user istemiş)
            return ResponseEntity.status(HttpStatus.CREATED).body(dto);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "Access denied"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/{pairId}")
    public ResponseEntity<?> get(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID pairId) {
        try {
            return ResponseEntity.ok(service.getByPairId(pairId, principal.getId()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Transfer bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", e.getMessage()));
        }
    }

    @DeleteMapping("/{pairId}")
    public ResponseEntity<?> delete(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID pairId) {
        try {
            service.deleteByPairId(pairId, principal.getId());
            return ResponseEntity.noContent().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Transfer bulunamadi"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", e.getMessage()));
        }
    }
}
