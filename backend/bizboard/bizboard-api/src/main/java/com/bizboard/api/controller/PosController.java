package com.bizboard.api.controller;

import com.bizboard.common.dto.PosBusinessSummaryDto;
import com.bizboard.common.dto.PosTransactionRowDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.PosService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * v1.6.3: POS işlemleri sorgu endpoint'leri.
 *
 * v1.6.11.1: `/api/pos` → `/pos` (projedeki diğer controller'larla uyumlu;
 * Spring context-path yok, frontend `/pos/...` çağırıyor).
 */
@RestController
@RequestMapping("/pos")
@RequiredArgsConstructor
public class PosController {

    private final PosService posService;

    /** İşletme bazında POS özeti — kart görünümü için. */
    @GetMapping("/businesses")
    public ResponseEntity<List<PosBusinessSummaryDto>> getBusinessSummaries(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(posService.getBusinessSummaries(principal.getId()));
    }

    /**
     * Günlük POS işlemleri tablosu.
     * @param date opsiyonel — verilmezse bugün
     * @param businessId opsiyonel — verilmezse tüm erişilebilir işletmeler
     */
    @GetMapping("/transactions/daily")
    public ResponseEntity<List<PosTransactionRowDto>> getDailyTransactions(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(name = "businessId", required = false) UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(posService.getDailyTransactions(principal.getId(), date, businessId));
    }
}
