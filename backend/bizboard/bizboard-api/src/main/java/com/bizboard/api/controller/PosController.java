package com.bizboard.api.controller;

import com.bizboard.common.dto.PosBulkSettleRequest;
import com.bizboard.common.dto.PosBusinessSummaryDto;
import com.bizboard.common.dto.PosTransactionRowDto;
import com.bizboard.common.dto.TransactionDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.PosService;
import com.bizboard.service.TransactionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
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
    private final TransactionService transactionService;

    /** İşletme bazında POS özeti — kart görünümü için. */
    @GetMapping("/businesses")
    public ResponseEntity<List<PosBusinessSummaryDto>> getBusinessSummaries(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(posService.getBusinessSummaries(principal.getId()));
    }

    /**
     * v1.6.23.9 (TODO ddda6029): Settle olmamış POS tx'ler.
     * @param deviceId opsiyonel — verilirse o cihazın bekleyenleri
     */
    @GetMapping("/unsettled")
    public ResponseEntity<List<TransactionDto>> getUnsettled(
            @RequestParam(name = "deviceId", required = false) UUID deviceId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(posService.getUnsettledTransactions(deviceId, principal.getId()));
    }

    /**
     * v1.6.23.9 (TODO ddda6029): Toplu POS settle.
     * Tüm seçili tx'leri aynı bank'a aynı timestamp ile işaretler (atomic).
     */
    @PostMapping("/bulk-settle")
    public ResponseEntity<?> bulkSettle(
            @Valid @RequestBody PosBulkSettleRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            return ResponseEntity.ok(transactionService.bulkSettlePosTransactions(
                    req.getTransactionIds(), principal.getId(),
                    req.getBankAccountId(), req.getSettledAt()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(java.util.Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(java.util.Map.of("error", e.getMessage()));
        }
    }

    /**
     * Günlük POS işlemleri tablosu.
     * @param date opsiyonel — verilmezse bugün (days verilmediğinde)
     * @param days opsiyonel — v1.6.23.7: son N gün için POS tx'leri (date göz ardı).
     *             Frontend `pos-cihazlari` sayfası days=30 ile çağırıyor.
     * @param businessId opsiyonel — verilmezse tüm erişilebilir işletmeler
     */
    @GetMapping("/transactions/daily")
    public ResponseEntity<List<PosTransactionRowDto>> getDailyTransactions(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) Integer days,
            @RequestParam(name = "businessId", required = false) UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (days != null && days > 0) {
            return ResponseEntity.ok(
                    posService.getRecentTransactions(principal.getId(), days, businessId));
        }
        return ResponseEntity.ok(posService.getDailyTransactions(principal.getId(), date, businessId));
    }
}
