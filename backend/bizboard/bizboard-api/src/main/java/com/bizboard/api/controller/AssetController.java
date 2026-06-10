package com.bizboard.api.controller;

import com.bizboard.common.dto.AcquireAssetRequest;
import com.bizboard.common.dto.AssetDto;
import com.bizboard.common.dto.SellAssetRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.AssetService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §3.1 / §7 / TODO 2) — ayni varlık (ASSET) edinim/satış.
 *
 * <ul>
 *   <li>{@code GET  /assets?business_id=&include_sold=}     — envanter listesi</li>
 *   <li>{@code POST /assets/acquire?business_id=}           — edinim (ASSET hesabı + posting)</li>
 *   <li>{@code POST /assets/sell?business_id=}              — satış (P&L gelir/zarar)</li>
 * </ul>
 *
 * <p>Yeni kod — mevcut envanter/inventory akışını DEĞİŞTİRMEZ (ASSET account tipi).</p>
 */
@RestController
@RequestMapping("/assets")
@RequiredArgsConstructor
public class AssetController {

    private final AssetService service;

    @GetMapping
    public ResponseEntity<?> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(name = "include_sold", defaultValue = "false") boolean includeSold) {
        try {
            return ResponseEntity.ok(service.list(principal.getId(), businessId, includeSold));
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/acquire")
    public ResponseEntity<?> acquire(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @Valid @RequestBody AcquireAssetRequest req) {
        try {
            AssetDto dto = service.acquire(principal.getId(), businessId, req);
            return ResponseEntity.status(HttpStatus.CREATED).body(dto);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return badRequest(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    @PostMapping("/sell")
    public ResponseEntity<?> sell(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @Valid @RequestBody SellAssetRequest req) {
        try {
            return ResponseEntity.ok(service.sell(principal.getId(), businessId, req));
        } catch (IllegalArgumentException e) {
            return badRequest(e.getMessage());
        } catch (IllegalStateException e) {
            return badRequest(e.getMessage());
        } catch (SecurityException e) {
            return forbidden();
        }
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Yetki yok"));
    }

    private ResponseEntity<?> badRequest(String msg) {
        return ResponseEntity.badRequest().body(Map.of("message", msg));
    }
}
