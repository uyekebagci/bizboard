package com.bizboard.api.controller;

import com.bizboard.service.CounterpartLedgerService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

/**
 * Counterpart admin operasyonları. Şimdilik yalnız manuel cari bakiye recompute
 * — event-driven update herhangi bir nedenle (manuel SQL, restore, vb.) drift
 * ettiğinde admin paneli üzerinden tetiklenir.
 *
 * <p>{@code /admin/**} kuralı ROLE_ADMIN gerektirir.</p>
 */
@RestController
@RequestMapping("/admin/counterparts")
@RequiredArgsConstructor
public class AdminCounterpartController {

    private final CounterpartLedgerService ledgerService;

    @PostMapping("/{id}/recompute")
    public ResponseEntity<Map<String, Object>> recompute(@PathVariable UUID id) {
        BigDecimal balance = ledgerService.recompute(id);
        return ResponseEntity.ok(Map.of(
                "counterpart_id", id,
                "balance", balance
        ));
    }
}
