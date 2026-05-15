package com.bizboard.api.controller;

import com.bizboard.common.dto.CreateFixedCostRequest;
import com.bizboard.common.dto.FixedCostDto;
import com.bizboard.common.dto.FixedCostSummaryDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.FixedCostService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class FixedCostController {

    private final FixedCostService fixedCostService;

    // ─── İşletmeye ait sabit giderler ─────────────────────────

    @GetMapping("/businesses/{businessId}/fixed-costs")
    public ResponseEntity<List<FixedCostDto>> getFixedCosts(
            @PathVariable UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(fixedCostService.getFixedCostsForBusiness(businessId, principal.getId()));
    }

    @GetMapping("/businesses/{businessId}/fixed-costs/summary")
    public ResponseEntity<FixedCostSummaryDto> getFixedCostSummary(
            @PathVariable UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(fixedCostService.getFixedCostSummary(businessId, principal.getId()));
    }

    @PostMapping("/businesses/{businessId}/fixed-costs")
    public ResponseEntity<FixedCostDto> createFixedCost(
            @PathVariable UUID businessId,
            @RequestBody CreateFixedCostRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(fixedCostService.createFixedCost(businessId, request, principal.getId()));
    }

    // ─── Tekil sabit gider işlemleri ──────────────────────────

    @PutMapping("/fixed-costs/{fixedCostId}")
    public ResponseEntity<FixedCostDto> updateFixedCost(
            @PathVariable UUID fixedCostId,
            @RequestBody CreateFixedCostRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(fixedCostService.updateFixedCost(fixedCostId, request, principal.getId()));
    }

    @DeleteMapping("/fixed-costs/{fixedCostId}")
    public ResponseEntity<Void> deleteFixedCost(
            @PathVariable UUID fixedCostId,
            @AuthenticationPrincipal UserPrincipal principal) {
        fixedCostService.deleteFixedCost(fixedCostId, principal.getId());
        return ResponseEntity.noContent().build();
    }
}
