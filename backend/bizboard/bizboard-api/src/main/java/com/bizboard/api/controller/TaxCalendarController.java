package com.bizboard.api.controller;

import com.bizboard.common.dto.TaxDeadlineDto;
import com.bizboard.service.taxcalendar.TaxCalendarService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * Vergi Takvimi Modülü — TR vergi son tarihleri API'si.
 *
 * <p>{@code GET /tax-calendar?from=&to=} verilen aralıktaki tüm vergi son tarihlerini
 * (KDV, Muhtasar, BA-BS, Geçici Vergi, Kurumlar/Gelir Vergisi) tarih sırasıyla döner.
 * Tarihler tekrarlayan kurallardan ({@code TaxDeadlineRule}) hesaplanır; yıllık seed
 * gerektirmez.</p>
 *
 * <p>Takvim master data tüm tenant'lar için ortaktır (GİB takvimi geneldir),
 * bu yüzden işletme scope'u yoktur. Yetkilendirme: {@code SecurityConfig} gereği
 * authenticated. {@code from} verilmezse bugün, {@code to} verilmezse from + ~92 gün.</p>
 */
@RestController
@RequiredArgsConstructor
public class TaxCalendarController {

    /** Aralık verilmediğinde varsayılan ileri pencere (yaklaşık bir çeyrek). */
    private static final int DEFAULT_WINDOW_DAYS = 92;

    /** Aşırı geniş sorguyu (DoS) önlemek için maksimum aralık. */
    private static final long MAX_RANGE_DAYS = 366L * 3;

    private final TaxCalendarService taxCalendarService;

    @GetMapping("/tax-calendar")
    public ResponseEntity<List<TaxDeadlineDto>> getTaxCalendar(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        LocalDate start = from != null ? from : LocalDate.now();
        LocalDate end = to != null ? to : start.plusDays(DEFAULT_WINDOW_DAYS);

        // Sınır doğrulama (boundary): geçersiz/aşırı aralıkları reddet.
        if (end.isBefore(start)) {
            return ResponseEntity.badRequest().build();
        }
        if (java.time.temporal.ChronoUnit.DAYS.between(start, end) > MAX_RANGE_DAYS) {
            end = start.plusDays(MAX_RANGE_DAYS);
        }

        return ResponseEntity.ok(taxCalendarService.deadlinesBetween(start, end));
    }
}
