package com.bizboard.api.controller;

import com.bizboard.common.dto.FinanceOverviewDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.FinanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * Finans modülü controller.
 *
 * GET /finance/overview?months=6  → Kapsamlı finans özeti (aylık trend, kategori kırılımı,
 *                                    işletme bazlı analiz, nakit akışı, top işlemler)
 */
@RestController
@RequestMapping("/finance")
@RequiredArgsConstructor
public class FinanceController {

    private final FinanceService financeService;

    @GetMapping("/overview")
    public ResponseEntity<FinanceOverviewDto> getFinanceOverview(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "6") int months) {
        return ResponseEntity.ok(financeService.getFinanceOverview(principal.getId(), months));
    }
}
