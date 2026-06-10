package com.bizboard.api.controller;

import com.bizboard.security.UserPrincipal;
import com.bizboard.service.CashClosingToDayCloseMigrationRunner;
import com.bizboard.service.LedgerFeatureFlagService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Ledger v2 (Faz B) — ADMIN-only gün-kapanışı operasyonları.
 *
 * <p>{@code /admin/**} SecurityConfig'de ROLE_ADMIN ile korunur. Migration
 * idempotent + dry-run + reversible; feature flag §4.1 backdate kapısı.</p>
 *
 * <ul>
 *   <li>{@code POST /admin/day-close/migrate?dryRun=}  — CashClosing→DayClose (idempotent)</li>
 *   <li>{@code POST /admin/day-close/migrate/reverse}  — migrate edilen DayClose'ları sil</li>
 *   <li>{@code GET  /admin/day-close/backdate-flag}    — §4.1 flag durumu</li>
 *   <li>{@code POST /admin/day-close/backdate-flag?enabled=} — flag aç/kapat</li>
 * </ul>
 */
@RestController
@RequestMapping("/admin/day-close")
@RequiredArgsConstructor
public class AdminDayCloseController {

    private final CashClosingToDayCloseMigrationRunner migrationRunner;
    private final LedgerFeatureFlagService featureFlags;

    @PostMapping("/migrate")
    public ResponseEntity<CashClosingToDayCloseMigrationRunner.MigrationReport> migrate(
            @RequestParam(name = "dryRun", defaultValue = "true") boolean dryRun,
            @AuthenticationPrincipal UserPrincipal principal) {
        var report = migrationRunner.migrate(dryRun,
                principal != null ? principal.getId() : null,
                principal != null ? principal.getUsername() : null);
        return ResponseEntity.ok(report);
    }

    @PostMapping("/migrate/reverse")
    public ResponseEntity<Map<String, Object>> reverseMigration(
            @AuthenticationPrincipal UserPrincipal principal) {
        int removed = migrationRunner.reverse(
                principal != null ? principal.getId() : null,
                principal != null ? principal.getUsername() : null);
        return ResponseEntity.ok(Map.of("removed", removed));
    }

    @GetMapping("/backdate-flag")
    public ResponseEntity<Map<String, Object>> getBackdateFlag() {
        return ResponseEntity.ok(Map.of(
                "key", LedgerFeatureFlagService.KEY_BACKDATE_ENABLED,
                "enabled", featureFlags.isBackdateEnabled()));
    }

    @PostMapping("/backdate-flag")
    public ResponseEntity<Map<String, Object>> setBackdateFlag(
            @RequestParam(name = "enabled") boolean enabled,
            @AuthenticationPrincipal UserPrincipal principal) {
        featureFlags.setBackdateEnabled(enabled, principal != null ? principal.getId() : null);
        return ResponseEntity.ok(Map.of(
                "key", LedgerFeatureFlagService.KEY_BACKDATE_ENABLED,
                "enabled", enabled));
    }
}
