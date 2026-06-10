package com.bizboard.api.controller;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.AuditLogService;
import com.bizboard.service.LedgerAdminService;
import com.bizboard.service.LedgerBalanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz A) — ADMIN-only posting backfill / invariant / reversal.
 *
 * <p>{@code /admin/**} SecurityConfig'de ROLE_ADMIN ile korunur. Tüm mutate
 * uçları audit'li (STRICT). Dry-run DB'ye dokunmaz; backfill idempotent;
 * reverse reversible.</p>
 *
 * <ul>
 *   <li>{@code GET  /admin/ledger/invariant}        — bakiye + entry denge raporu</li>
 *   <li>{@code POST /admin/ledger/backfill?dryRun=}  — tx→posting backfill (dry-run/gerçek)</li>
 *   <li>{@code POST /admin/ledger/reverse/{txId}}    — tek tx'in posting'lerini geri al</li>
 * </ul>
 */
@RestController
@RequestMapping("/admin/ledger")
@RequiredArgsConstructor
public class AdminLedgerController {

    private final LedgerAdminService ledgerAdminService;
    private final LedgerBalanceService ledgerBalanceService;
    private final AuditLogService auditLogService;

    /** Bakiye (snapshot ↔ türetilmiş) + entry denge (Σ=0) invariant raporu. */
    @GetMapping("/invariant")
    public ResponseEntity<LedgerBalanceService.InvariantReport> invariant() {
        return ResponseEntity.ok(ledgerBalanceService.checkBalanceInvariant());
    }

    /**
     * Transaction → Posting backfill. {@code dryRun=true} (default) DB'ye dokunmaz,
     * yalnız kaç tx'in dengeli/FLAGGED olacağını raporlar. {@code dryRun=false}
     * gerçek (idempotent) backfill koşturur + audit'ler.
     */
    @PostMapping("/backfill")
    public ResponseEntity<LedgerAdminService.BackfillResult> backfill(
            @RequestParam(name = "dryRun", defaultValue = "true") boolean dryRun,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (dryRun) {
            return ResponseEntity.ok(ledgerAdminService.dryRunBackfill());
        }
        LedgerAdminService.BackfillResult result = ledgerAdminService.runBackfill();
        auditLogService.recordEntityAction(
                AuditAction.LEDGER_POSTING_BACKFILL,
                principal != null ? principal.getId() : null,
                principal != null ? principal.getUsername() : null,
                "LEDGER", null,
                "Tx→Posting backfill (manuel) — toplam=" + result.getTotal()
                        + ", turetildi=" + result.getDerived()
                        + ", skip=" + result.getSkipped()
                        + ", FLAGGED=" + result.getFlagged(),
                Map.of(
                        "total", result.getTotal(),
                        "derived", result.getDerived(),
                        "skipped", result.getSkipped(),
                        "flagged", result.getFlagged()));
        return ResponseEntity.ok(result);
    }

    /** Reversible: bir tx'in türetilmiş entry+posting'lerini siler (audit'li). */
    @PostMapping("/reverse/{txId}")
    public ResponseEntity<Map<String, Object>> reverse(
            @PathVariable UUID txId,
            @AuthenticationPrincipal UserPrincipal principal) {
        int removed = ledgerAdminService.reverseForTransaction(txId);
        auditLogService.recordEntityAction(
                AuditAction.LEDGER_POSTING_REVERSE,
                principal != null ? principal.getId() : null,
                principal != null ? principal.getUsername() : null,
                "LEDGER", txId,
                "Tx posting reversal — silinen-entry=" + removed,
                Map.of("txId", txId.toString(), "removedEntries", removed));
        return ResponseEntity.ok(Map.of("txId", txId.toString(), "removedEntries", removed));
    }
}
