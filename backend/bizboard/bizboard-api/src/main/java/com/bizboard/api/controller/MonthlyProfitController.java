package com.bizboard.api.controller;

import com.bizboard.security.UserPrincipal;
import com.bizboard.service.MonthlyProfitReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §5 / §6 / TODO 6+7) — aylık kâr raporu (kategori P&L +
 * operatör kırılımı + gider≠masraf).
 *
 * <ul>
 *   <li>{@code GET /profit-reports/monthly?business_id=&year=&month=}</li>
 * </ul>
 */
@RestController
@RequestMapping("/profit-reports")
@RequiredArgsConstructor
public class MonthlyProfitController {

    private final MonthlyProfitReportService service;

    @GetMapping("/monthly")
    public ResponseEntity<?> monthly(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam int year,
            @RequestParam int month) {
        try {
            return ResponseEntity.ok(service.report(principal.getId(), businessId, year, month));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "Yetki yok"));
        }
    }
}
