package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.TemporalAdjusters;

/**
 * Tier 3 (EVT-2): zamanlanmış HAFTALIK + AYLIK finansal özet scheduler'ı.
 *
 * <p>Mevcut scheduler deseni ({@code CashClosingScheduler} / {@code DebtDueReminderScheduler})
 * ile birebir: {@code @Scheduled(cron=..., zone="Europe/Istanbul")} + iş mantığı
 * {@link PeriodicSummaryService}'te. Cron yalnız "ne zaman + hangi dönem"i belirler;
 * AÇ/KAPA kararı ve içerik servistedir.</p>
 *
 * <ul>
 *   <li><b>Haftalık</b> — her Pazartesi 08:00; ÖNCEKİ hafta (önceki Pzt → önceki Pzr).</li>
 *   <li><b>Aylık</b> — her ayın 1'i 08:05; ÖNCEKİ tam ay (ayın 1'i → sonu).</li>
 * </ul>
 *
 * <p><b>DEFAULT KAPALI:</b> servis her işletme için opt-in tercihi kontrol eder;
 * kapalı işletmeye özet GİTMEZ (non-breaking, spam-kaçın). Cron tek instance
 * varsayar (mevcut CashClosingScheduler ile aynı varsayım).</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PeriodicSummaryScheduler {

    private final PeriodicSummaryService summaryService;

    /**
     * Pazartesi 08:00 — ÖNCEKİ hafta özeti.
     * Cron: {@code 0 0 8 * * MON} (saniye dakika saat gün ay haftaGünü)
     */
    @Scheduled(cron = "0 0 8 * * MON", zone = "Europe/Istanbul")
    public void runWeekly() {
        // Bugün Pazartesi; önceki hafta = geçen Pazartesi → geçen Pazar.
        LocalDate thisMonday = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate start = thisMonday.minusWeeks(1);
        LocalDate end = thisMonday.minusDays(1); // önceki Pazar
        try {
            int sent = summaryService.sendWeeklySummaries(start, end);
            log.info("[summary-weekly] {}..{} — {} işletmeye gönderildi", start, end, sent);
        } catch (Exception e) {
            log.warn("[summary-weekly] çalıştırma hatası (non-fatal): {}", e.getMessage());
        }
    }

    /**
     * Ayın 1'i 08:05 — ÖNCEKİ tam ay özeti.
     * Cron: {@code 0 5 8 1 * *}
     */
    @Scheduled(cron = "0 5 8 1 * *", zone = "Europe/Istanbul")
    public void runMonthly() {
        YearMonth prev = YearMonth.from(LocalDate.now()).minusMonths(1);
        LocalDate start = prev.atDay(1);
        LocalDate end = prev.atEndOfMonth();
        try {
            int sent = summaryService.sendMonthlySummaries(start, end);
            log.info("[summary-monthly] {}..{} — {} işletmeye gönderildi", start, end, sent);
        } catch (Exception e) {
            log.warn("[summary-monthly] çalıştırma hatası (non-fatal): {}", e.getMessage());
        }
    }
}
