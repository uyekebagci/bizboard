package com.bizboard.api.controller;

import com.bizboard.common.dto.BudgetThresholdDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.BudgetThresholdService;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Raporlar v1.1 (R7) — ADMIN-only kategori/dönem bütçe-eşik konfigürasyonu.
 *
 * <p>{@code /admin/**} SecurityConfig'de ROLE_ADMIN ile korunur. İşletme+kategori
 * başına AYLIK bütçe. <b>DEFAULT KAPALI</b> — bütçe set edilmedikçe (null/0)
 * alarm üretilmez (non-breaking, opt-in, spam-kaçın). Set işlemi audit'lenir.</p>
 *
 * <ul>
 *   <li>{@code GET /admin/budget-thresholds?business_id=} — kategori bütçeleri + kullanım</li>
 *   <li>{@code PUT /admin/budget-thresholds?business_id=} — bir kategori bütçesini güncelle</li>
 * </ul>
 */
@RestController
@RequestMapping("/admin/budget-thresholds")
@RequiredArgsConstructor
public class AdminBudgetController {

    private final BudgetThresholdService budgetThresholdService;

    @GetMapping
    public ResponseEntity<BudgetThresholdDto> getBudgets(
            @RequestParam(name = "business_id") UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
                budgetThresholdService.getBudgets(principal.getId(), businessId));
    }

    @PutMapping
    public ResponseEntity<BudgetThresholdDto> setBudget(
            @RequestParam(name = "business_id") UUID businessId,
            @RequestBody BudgetRequest body,
            @AuthenticationPrincipal UserPrincipal principal) {
        budgetThresholdService.setBudget(
                businessId,
                body != null ? body.categoryId() : null,
                body != null ? body.budget() : null,
                principal != null ? principal.getId() : null);
        // güncel durumu (kullanım dahil) geri dön — UI tek çağrıyla yenilenir.
        return ResponseEntity.ok(
                budgetThresholdService.getBudgets(principal.getId(), businessId));
    }

    /** PUT gövdesi: budget null/0 → ilgili kategori bütçesi kapatılır. snake_case JSON. */
    public record BudgetRequest(
            @JsonProperty("category_id") UUID categoryId,
            @JsonProperty("budget") BigDecimal budget) {}
}
