package com.bizboard.api.controller;

import com.bizboard.security.UserPrincipal;
import com.bizboard.service.RecurringTxGeneratorService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * v1.5.9: Recurring tx jeneratörü manuel tetikleyici. Admin paneli üzerinden
 * "Şimdi üret" butonu burayı çağırır. Scheduled @01-02:30 zaten otomatik olarak
 * çalışıyor; bu endpoint test / acil senaryolar için.
 */
@RestController
@RequestMapping("/admin/recurring")
@RequiredArgsConstructor
public class AdminRecurringController {

    private final RecurringTxGeneratorService service;

    @PostMapping("/run")
    public ResponseEntity<Map<String, Object>> runNow(@AuthenticationPrincipal UserPrincipal principal) {
        RecurringTxGeneratorService.GenerationResult r =
                service.run(LocalDateTime.now(), principal.getId(), principal.getUsername());
        return ResponseEntity.ok(Map.of(
                "processed", r.processed(),
                "created", r.created(),
                "skipped", r.skipped()
        ));
    }
}
