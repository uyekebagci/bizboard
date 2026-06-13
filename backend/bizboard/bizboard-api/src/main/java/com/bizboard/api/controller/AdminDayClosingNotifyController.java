package com.bizboard.api.controller;

import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.DayClose;
import com.bizboard.common.enums.DayCloseStatus;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.DayCloseRepository;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.DayClosingNotificationService;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * GUN-1..4 — ADMIN-only "gün-kapanışı → Telegram grubu özeti" konfigürasyonu +
 * test önizleme.
 *
 * <p>{@code /admin/**} SecurityConfig'de ROLE_ADMIN ile korunur. İşletme-başına
 * tek toggle. <b>DEFAULT KAPALI</b> — kullanıcı Telegram grubunu kurup bağlayınca
 * admin aktive eder; açılmadıkça gönderim yoktur (non-breaking, spam-yok). Set
 * işlemi audit'lenir.</p>
 *
 * <ul>
 *   <li>{@code GET  /admin/day-closing-notify/config?business_id=} — mevcut tercih</li>
 *   <li>{@code PUT  /admin/day-closing-notify/config?business_id=} — tercihi güncelle (aktive/deaktive)</li>
 *   <li>{@code POST /admin/day-closing-notify/test?business_id=&date=}
 *       — TEST: o tarihin gün-kapanışı özet gövdesini ÖNİZLE (gönderim YAPMADAN).
 *       Opt-in gerektirmez (admin manuel doğrulama). date verilmezse en son kapanış.</li>
 * </ul>
 */
@RestController
@RequestMapping("/admin/day-closing-notify")
@RequiredArgsConstructor
public class AdminDayClosingNotifyController {

    private final DayClosingNotificationService notifyService;
    private final BusinessRepository businessRepository;
    private final DayCloseRepository dayCloseRepository;

    @GetMapping("/config")
    public ResponseEntity<Map<String, Object>> getConfig(
            @RequestParam(name = "business_id") UUID businessId) {
        return ResponseEntity.ok(toResponse(businessId, notifyService.isEnabled(businessId)));
    }

    @PutMapping("/config")
    public ResponseEntity<Map<String, Object>> setConfig(
            @RequestParam(name = "business_id") UUID businessId,
            @RequestBody ConfigRequest body,
            @AuthenticationPrincipal UserPrincipal principal) {
        boolean enabled = notifyService.setEnabled(
                businessId,
                body != null && body.enabled(),
                principal != null ? principal.getId() : null);
        return ResponseEntity.ok(toResponse(businessId, enabled));
    }

    /**
     * TEST/doğrulama: verilen tarihin (yoksa en son kapanış) gün-özeti gövdesini
     * önizler — bildirim GÖNDERMEZ, opt-in gerektirmez. TEST işletmesinde manuel
     * doğrulama için.
     */
    @PostMapping("/test")
    public ResponseEntity<Map<String, Object>> previewTest(
            @RequestParam(name = "business_id") UUID businessId,
            @RequestParam(name = "date", required = false) String dateRaw) {
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("İşletme bulunamadı"));

        DayClose dc;
        if (dateRaw != null && !dateRaw.isBlank()) {
            LocalDate date = LocalDate.parse(dateRaw.trim());
            dc = dayCloseRepository.findByBusinessIdAndCloseDate(businessId, date)
                    .orElseThrow(() -> new IllegalArgumentException("Kapanış bulunamadı: " + date));
        } else {
            dc = dayCloseRepository.findByBusinessIdOrderByCloseDateDesc(businessId).stream()
                    .filter(d -> d.getStatus() == DayCloseStatus.CLOSED)
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Bu işletme için CLOSED gün-kapanışı yok (önce kapanış yapın)"));
        }

        String body = notifyService.buildSummaryBody(business, dc);

        Map<String, Object> out = new HashMap<>();
        out.put("business_id", businessId.toString());
        out.put("date", dc.getCloseDate() != null ? dc.getCloseDate().toString() : null);
        out.put("enabled", notifyService.isEnabled(businessId));
        out.put("title", "✅ Gün kapanışı yapıldı: "
                + (business.getName() != null ? business.getName() : "")
                + " (" + (dc.getCloseDate() != null ? dc.getCloseDate() : "") + ")");
        out.put("summary", body);
        return ResponseEntity.ok(out);
    }

    private static Map<String, Object> toResponse(UUID businessId, boolean enabled) {
        Map<String, Object> out = new HashMap<>();
        out.put("business_id", businessId.toString());
        out.put("enabled", enabled);
        return out;
    }

    /** PUT gövdesi. snake_case JSON (proje konvansiyonu). */
    public record ConfigRequest(@JsonProperty("enabled") boolean enabled) {}
}
