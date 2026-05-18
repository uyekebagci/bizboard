package com.bizboard.api.controller;

import com.bizboard.common.dto.CashBusinessBalanceDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.CashService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * v1.6.3: nakit bakiyesi olan işletmeler (/api/cash/businesses).
 */
@RestController
@RequestMapping("/api/cash")
@RequiredArgsConstructor
public class CashController {

    private final CashService cashService;

    @GetMapping("/businesses")
    public ResponseEntity<List<CashBusinessBalanceDto>> getBusinessBalances(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(cashService.getBusinessBalances(principal.getId()));
    }
}
