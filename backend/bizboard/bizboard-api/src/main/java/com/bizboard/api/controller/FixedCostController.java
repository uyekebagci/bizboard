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
            @PathVariable UUID businessId) {
        return ResponseEntity.ok(fixedCostService.getFixedCostsForBusiness(businessId));
    }

    @GetMapping("/businesses/{businessId}/fixed-costs/summary")
    public ResponseEntity<FixedCostSummaryDto> getFixedCostSummary(
            @PathVariable UUID businessId) {
        return ResponseEntity.ok(fixedCostService.getFixedCostSummary(businessId));
    }

    @PostMapping("/businesses/{businessId}/fixed-costs")
    public ResponseEntity<FixedCostDto> createFixedCost(
            @PathVariable UUID businessId,
            @RequestBody CreateFixedCostRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(fixedCostService.createFixedCost(businessId, request));
    }

    // ─── Tekil sabit gider işlemleri ──────────────────────────

    @PutMapping("/fixed-costs/{fixedCostId}")
    public ResponseEntity<FixedCostDto> updateFixedCost(
            @PathVariable UUID fixedCostId,
            @RequestBody CreateFixedCostRequest request) {
        return ResponseEntity.ok(fixedCostService.updateFixedCost(fixedCostId, request));
    }

    @DeleteMapping("/fixed-costs/{fixedCostId}")
    public ResponseEntity<Void> deleteFixedCost(
            @PathVariable UUID fixedCostId) {
        fixedCostService.deleteFixedCost(fixedCostId);
        return ResponseEntity.noContent().build();
    }
}
