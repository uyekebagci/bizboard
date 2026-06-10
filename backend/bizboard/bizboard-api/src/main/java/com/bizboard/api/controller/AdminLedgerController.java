package com.bizboard.api.controller;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.AuditLogService;
import com.bizboard.service.LedgerAdminService;
import com.bizboard.service.LedgerBalanceService;
import com.bizboard.service.LedgerCategoryHygieneService;
import com.bizboard.service.LedgerNameParseService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
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
 *   <li>{@code GET  /admin/ledger/suggestions/firm-bank}  — firma↔banka parse önerisi (dry-run)</li>
 *   <li>{@code GET  /admin/ledger/suggestions/typo-merge} — typo-merge önerisi (dry-run)</li>
 *   <li>{@code GET  /admin/ledger/suggestions/operator-categories} — operatör kategori ayıklama (§3.10)</li>
 *   <li>{@code GET  /admin/ledger/suggestions/duplicate-categories} — aynı isimli kategori (dry-run)</li>
 * </ul>
 *
 * <p>Tüm {@code /suggestions/*} uçları SALT-OKUNUR (DB'ye dokunmaz) — STRICT:
 * otomatik commit YOK, uygulama elle onayla yapılır.</p>
 */
@RestController
@RequestMapping("/admin/ledger")
@RequiredArgsConstructor
public class AdminLedgerController {

    private final LedgerAdminService ledgerAdminService;
    private final LedgerBalanceService ledgerBalanceService;
    private final LedgerNameParseService ledgerNameParseService;
    private final LedgerCategoryHygieneService ledgerCategoryHygieneService;
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
     *
     * <p>{@code businessId} verilirse YALNIZ o işletme türetilir (izole test +
     * güvenli tek-işletme yeniden-türetme — diğer işletmelere DOKUNMAZ).
     * Verilmezse GLOBAL (tüm işletmeler) — eski davranış aynen korunur.</p>
     */
    @PostMapping("/backfill")
    public ResponseEntity<LedgerAdminService.BackfillResult> backfill(
            @RequestParam(name = "dryRun", defaultValue = "true") boolean dryRun,
            @RequestParam(name = "businessId", required = false) UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (dryRun) {
            return ResponseEntity.ok(ledgerAdminService.dryRunBackfill(businessId));
        }
        LedgerAdminService.BackfillResult result = ledgerAdminService.runBackfill(businessId);
        auditLogService.recordEntityAction(
                AuditAction.LEDGER_POSTING_BACKFILL,
                principal != null ? principal.getId() : null,
                principal != null ? principal.getUsername() : null,
                "LEDGER", businessId,
                "Tx→Posting backfill (manuel, scope=" + (businessId != null ? businessId : "GLOBAL")
                        + ") — toplam=" + result.getTotal()
                        + ", turetildi=" + result.getDerived()
                        + ", skip=" + result.getSkipped()
                        + ", FLAGGED=" + result.getFlagged(),
                Map.of(
                        "scope", businessId != null ? businessId.toString() : "GLOBAL",
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

    // ───────── ÖNERİ uçları (SALT-OKUNUR, dry-run; STRICT: commit YOK) ─────────

    /** §8.4: firma↔banka isim parse önerisi. DB'ye dokunmaz. */
    @GetMapping("/suggestions/firm-bank")
    public ResponseEntity<List<LedgerNameParseService.NameParseSuggestion>> firmBankSuggestions() {
        return ResponseEntity.ok(ledgerNameParseService.suggestFirmBankParse());
    }

    /** §1.4: typo-merge önerisi (aynı kanonik forma düşen farklı yazımlar). */
    @GetMapping("/suggestions/typo-merge")
    public ResponseEntity<List<LedgerNameParseService.TypoMergeSuggestion>> typoMergeSuggestions() {
        return ResponseEntity.ok(ledgerNameParseService.suggestTypoMerge());
    }

    /** §3.10 (A6): operatör/kişi-tipi kategori ayıklama önerisi. */
    @GetMapping("/suggestions/operator-categories")
    public ResponseEntity<List<LedgerCategoryHygieneService.OperatorCategorySuggestion>>
            operatorCategorySuggestions() {
        return ResponseEntity.ok(ledgerCategoryHygieneService.suggestOperatorCategoryExtraction());
    }

    /** §8.6: aynı isimli aktif kategori (duplicate) merge önerisi. */
    @GetMapping("/suggestions/duplicate-categories")
    public ResponseEntity<List<LedgerCategoryHygieneService.DuplicateCategorySuggestion>>
            duplicateCategorySuggestions() {
        return ResponseEntity.ok(ledgerCategoryHygieneService.suggestDuplicateMerge());
    }
}
