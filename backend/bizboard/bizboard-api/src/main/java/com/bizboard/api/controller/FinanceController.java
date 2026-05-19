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
 * GET /finance/overview?months=N        → N aylık periyot (klasik mod)
 * GET /finance/overview?days=N          → N günlük periyot (v1.6.15+ daily mod)
 *
 * `days` set ise `months` görmezden gelinir. days mod'da `monthly_trend` boş döner;
 * frontend `daily_cash_flow` üzerinden son N günü bar chart olarak render eder.
 */
@RestController
@RequestMapping("/finance")
@RequiredArgsConstructor
public class FinanceController {

    private final FinanceService financeService;

    @GetMapping("/overview")
    public ResponseEntity<FinanceOverviewDto> getFinanceOverview(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "1") int months,
            @RequestParam(required = false) Integer days) {
        return ResponseEntity.ok(
                financeService.getFinanceOverview(principal.getId(), months, days));
    }
}
