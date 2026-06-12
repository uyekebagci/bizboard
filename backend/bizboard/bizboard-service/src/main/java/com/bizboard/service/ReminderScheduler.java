package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * Standalone hatırlatıcı scheduler — vadesi gelen hatırlatıcıları sahibine
 * bildirir ({@link ReminderService#fireDue}).
 *
 * <p>Cron her dakika kontrol eder (varsayılan {@code 0 * * * * *}); dakikalık
 * çözünürlük kullanıcı-tanımlı zamanlar için yeterli. {@code remind_at &le; now}
 * ve {@code enabled=true} olanlar fire edilir; tekrarlı olanlar bir sonraki
 * vadeye ötelenir, tek-seferlikler pasifleşir.</p>
 *
 * <p>Toggle: {@code app.reminders.scheduler.enabled} (DEFAULT AÇIK — kullanıcı
 * hatırlatıcı oluşturmadıkça zaten hiçbir şey fire etmez, spam riski yok).
 * Tek instance varsayılır (mevcut scheduler'larla aynı varsayım).</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReminderScheduler {

    private final ReminderService reminderService;
    private final org.springframework.core.env.Environment env;

    @Scheduled(cron = "${app.reminders.scheduler.cron:0 * * * * *}", zone = "Europe/Istanbul")
    public void scan() {
        boolean enabled = env.getProperty("app.reminders.scheduler.enabled", Boolean.class, Boolean.TRUE);
        if (!enabled) return; // toggle ile kapalı — sessiz çık.
        try {
            reminderService.fireDue(LocalDateTime.now());
        } catch (Exception e) {
            log.warn("[reminder-cron] tarama hatası: {}", e.getMessage());
        }
    }
}
