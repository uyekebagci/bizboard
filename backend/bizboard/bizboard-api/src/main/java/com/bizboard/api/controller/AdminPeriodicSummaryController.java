package com.bizboard.api.controller;

import com.bizboard.common.entity.Business;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.PeriodicSummaryService;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.TemporalAdjusters;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Tier 3 (EVT-2) — ADMIN-only periyodik (haftalık/aylık) finansal özet
 * konfigürasyonu + manuel tetikleme.
 *
 * <p>{@code /admin/**} SecurityConfig'de ROLE_ADMIN ile korunur. İşletme-başına
 * iki bağımsız toggle: haftalık + aylık. <b>DEFAULT KAPALI</b> — açılmadıkça özet
 * gönderilmez (non-breaking, spam-kaçın). Set işlemi audit'lenir.</p>
 *
 * <ul>
 *   <li>{@code GET  /admin/periodic-summary/config?business_id=} — mevcut tercih</li>
 *   <li>{@code PUT  /admin/periodic-summary/config?business_id=} — tercihi güncelle</li>
 *   <li>{@code POST /admin/periodic-summary/test?business_id=&period=weekly|monthly}
 *       — TEST: dönem özetini ÖNİZLE (gönderim yapmadan gövdeyi döner). Opt-in
 *       gerektirmez (admin manuel doğrulama).</li>
 * </ul>
 */
@RestController
@RequestMapping("/admin/periodic-summary")
@RequiredArgsConstructor
public class AdminPeriodicSummaryController {

    private final PeriodicSummaryService summaryService;
    private final BusinessRepository businessRepository;

    @GetMapping("/config")
    public ResponseEntity<Map<String, Object>> getConfig(
            @RequestParam(name = "business_id") UUID businessId) {
        return ResponseEntity.ok(toResponse(businessId, summaryService.getConfig(businessId)));
    }

    @PutMapping("/config")
    public ResponseEntity<Map<String, Object>> setConfig(
            @RequestParam(name = "business_id") UUID businessId,
            @RequestBody ConfigRequest body,
            @AuthenticationPrincipal UserPrincipal principal) {
        PeriodicSummaryService.SummaryConfig cfg = summaryService.setConfig(
                businessId,
                body != null && body.weeklyEnabled(),
                body != null && body.monthlyEnabled(),
                principal != null ? principal.getId() : null);
        return ResponseEntity.ok(toResponse(businessId, cfg));
    }

    /**
     * TEST/doğrulama: ÖNCEKİ dönem (haftalık/aylık) özet gövdesini önizler —
     * bildirim GÖNDERMEZ, opt-in gerektirmez. TEST işletmesinde manuel doğrulama
     * için.
     */
    @PostMapping("/test")
    public ResponseEntity<Map<String, Object>> previewTest(
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(name = "period", defaultValue = "weekly") String period) {
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("İşletme bulunamadı"));

        LocalDate start;
        LocalDate end;
        if ("monthly".equalsIgnoreCase(period)) {
            YearMonth prev = YearMonth.from(LocalDate.now()).minusMonths(1);
            start = prev.atDay(1);
            end = prev.atEndOfMonth();
        } else {
            LocalDate thisMonday = LocalDate.now()
                    .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            start = thisMonday.minusWeeks(1);
            end = thisMonday.minusDays(1);
        }
        String body = summaryService.buildSummaryBody(business, start, end);

        Map<String, Object> out = new HashMap<>();
        out.put("business_id", businessId.toString());
        out.put("period", period);
        out.put("period_start", start.toString());
        out.put("period_end", end.toString());
        out.put("summary", body);
        return ResponseEntity.ok(out);
    }

    private static Map<String, Object> toResponse(UUID businessId,
                                                  PeriodicSummaryService.SummaryConfig cfg) {
        Map<String, Object> out = new HashMap<>();
        out.put("business_id", businessId.toString());
        out.put("weekly_enabled", cfg.weeklyEnabled());
        out.put("monthly_enabled", cfg.monthlyEnabled());
        return out;
    }

    /** PUT gövdesi. snake_case JSON (proje konvansiyonu). */
    public record ConfigRequest(
            @JsonProperty("weekly_enabled") boolean weeklyEnabled,
            @JsonProperty("monthly_enabled") boolean monthlyEnabled) {}
}
