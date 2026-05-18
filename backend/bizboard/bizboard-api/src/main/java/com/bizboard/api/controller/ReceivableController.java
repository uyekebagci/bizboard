package com.bizboard.api.controller;

import com.bizboard.common.dto.ReceivableAggregateDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.ReceivableService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * v1.6.5: alacak aggregate endpoint'i.
 *
 * GET /api/receivables — counterpart bazlı, settled=false RECEIVABLE özeti.
 * Erişim filtresi {@code accessibleBusinesses} üzerinden.
 */
@RestController
@RequestMapping("/api/receivables")
@RequiredArgsConstructor
public class ReceivableController {

    private final ReceivableService receivableService;

    @GetMapping
    public ResponseEntity<List<ReceivableAggregateDto>> list(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(receivableService.getReceivables(principal.getId()));
    }
}
