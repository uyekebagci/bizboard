package com.bizboard.api.controller;

import com.bizboard.service.LedgerService;
import com.bizboard.service.SummaryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Kayıt Defteri (Ledger) yönetim endpoint'leri.
 * Admin seviyesinde — mutabakat ve manuel tetikleme işlemleri.
 */
@RestController
@RequestMapping("/admin/ledger")
@RequiredArgsConstructor
public class LedgerController {

    private final LedgerService ledgerService;
    private final SummaryService summaryService;

    /**
     * Wait list'teki bekleyen kayıtları anında işle.
     * Normalde 03:30'da otomatik çalışır ama manuel de tetiklenebilir.
     */
    @PostMapping("/process-waitlist")
    public ResponseEntity<Map<String, String>> processWaitList() {
        ledgerService.processWaitList();
        return ResponseEntity.ok(Map.of("status", "completed", "message", "Wait list islendi"));
    }

    /**
     * Tam mutabakat — tüm işletmelerin tüm geçmiş dönemlerini
     * sıfırdan yeniden hesaplar. Data consistency %100 garanti.
     */
    @PostMapping("/reconciliation")
    public ResponseEntity<LedgerService.ReconciliationResult> fullReconciliation() {
        LedgerService.ReconciliationResult result = ledgerService.fullReconciliation();
        return ResponseEntity.ok(result);
    }

    /**
     * Belirli bir ayı tüm işletmeler için kapatır/yeniden hesaplar.
     * Örn: POST /admin/ledger/close-month?year=2026&month=2
     */
    @PostMapping("/close-month")
    public ResponseEntity<Map<String, String>> closeMonth(
            @RequestParam int year,
            @RequestParam int month) {
        summaryService.closeMonthForAll(year, month);
        return ResponseEntity.ok(Map.of(
                "status", "completed",
                "message", String.format("%d/%d donemi kapatildi", year, month)
        ));
    }
}
