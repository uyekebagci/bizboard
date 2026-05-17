package com.bizboard.api.controller;

import com.bizboard.common.dto.DebtMigrationResultDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.CounterpartLedgerService;
import com.bizboard.service.DebtMigrationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
    private final DebtMigrationService debtMigrationService;

    @PostMapping("/{id}/recompute")
    public ResponseEntity<Map<String, Object>> recompute(@PathVariable UUID id) {
        BigDecimal balance = ledgerService.recompute(id);
        return ResponseEntity.ok(Map.of(
                "counterpart_id", id,
                "balance", balance
        ));
    }

    /**
     * v1.5.0 öncesi free-text {@code debt.counterparty} borçlarını Counterpart
     * kayıtlarına bağlar. Query params:
     * <ul>
     *   <li>{@code dry_run=true} (default true) — gerçek mutation yok, sadece sayım</li>
     *   <li>{@code auto_create=false} (default false) — eşleşmeyen counterparty
     *       string'leri için yeni Counterpart yarat</li>
     * </ul>
     */
    @PostMapping("/migrate-debts")
    public ResponseEntity<DebtMigrationResultDto> migrateDebts(
            @RequestParam(name = "dry_run", defaultValue = "true") boolean dryRun,
            @RequestParam(name = "auto_create", defaultValue = "false") boolean autoCreate,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                debtMigrationService.migrateCounterparts(
                        dryRun, autoCreate, principal.getId(), principal.getUsername()));
    }
}
