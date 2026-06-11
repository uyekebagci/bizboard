package com.bizboard.api.controller;

import com.bizboard.security.UserPrincipal;
import com.bizboard.service.FinancialAlertService;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Tier 2 (EVT-1, §2.2 + §2.4) — ADMIN-only finansal alarm eşik konfigürasyonu.
 *
 * <p>{@code /admin/**} SecurityConfig'de ROLE_ADMIN ile korunur. İşletme-başına
 * iki eşik: bakiye eşiği ({@code balance_threshold}) + tek-harcama eşiği
 * ({@code high_expense_threshold}). <b>DEFAULT KAPALI</b> — eşik set edilmedikçe
 * (null/0) alarm üretilmez (non-breaking). Set işlemi audit'lenir.</p>
 *
 * <ul>
 *   <li>{@code GET  /admin/financial-alerts/thresholds?business_id=} — mevcut eşikler</li>
 *   <li>{@code PUT  /admin/financial-alerts/thresholds?business_id=} — eşikleri güncelle</li>
 * </ul>
 */
@RestController
@RequestMapping("/admin/financial-alerts")
@RequiredArgsConstructor
public class AdminFinancialAlertController {

    private final FinancialAlertService financialAlertService;

    @GetMapping("/thresholds")
    public ResponseEntity<Map<String, Object>> getThresholds(
            @RequestParam(name = "business_id") UUID businessId) {
        FinancialAlertService.ThresholdConfig cfg = financialAlertService.getThresholds(businessId);
        return ResponseEntity.ok(toResponse(businessId, cfg));
    }

    @PutMapping("/thresholds")
    public ResponseEntity<Map<String, Object>> setThresholds(
            @RequestParam(name = "business_id") UUID businessId,
            @RequestBody ThresholdRequest body,
            @AuthenticationPrincipal UserPrincipal principal) {
        FinancialAlertService.ThresholdConfig cfg = financialAlertService.setThresholds(
                businessId,
                body != null ? body.balanceThreshold() : null,
                body != null ? body.highExpenseThreshold() : null,
                principal != null ? principal.getId() : null);
        return ResponseEntity.ok(toResponse(businessId, cfg));
    }

    /** null eşik → response'ta {@code null} (= kapalı); UI on/off + input bunu kullanır. */
    private static Map<String, Object> toResponse(UUID businessId,
                                                  FinancialAlertService.ThresholdConfig cfg) {
        Map<String, Object> out = new HashMap<>();
        out.put("business_id", businessId.toString());
        out.put("balance_threshold",
                cfg.balanceThreshold() != null ? cfg.balanceThreshold().toPlainString() : null);
        out.put("high_expense_threshold",
                cfg.highExpenseThreshold() != null ? cfg.highExpenseThreshold().toPlainString() : null);
        return out;
    }

    /** PUT gövdesi: null/0 → ilgili eşik kapatılır. snake_case JSON (proje konvansiyonu). */
    public record ThresholdRequest(
            @JsonProperty("balance_threshold") BigDecimal balanceThreshold,
            @JsonProperty("high_expense_threshold") BigDecimal highExpenseThreshold) {}
}
