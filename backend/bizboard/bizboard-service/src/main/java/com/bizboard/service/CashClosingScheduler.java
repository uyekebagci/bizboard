package com.bizboard.service;

import com.bizboard.common.entity.CashClosing;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.CashClosingStatus;
import com.bizboard.common.enums.NotificationType;
import com.bizboard.repository.CashClosingRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * v1.6.19 (WP-2): Günlük kasa kapanışı scheduler'ı.
 *
 * <ul>
 *   <li>19:30 — Bugün için kapanış yoksa admin'lere reminder push.</li>
 *   <li>20:00 — Bugün için kapanış hala yoksa otomatik kapama
 *       (actualBalance=null, is_auto=true). Sonrasında admin'lere
 *       "auto-closed" bildirimi.</li>
 * </ul>
 *
 * <p>Cron'lar Europe/Istanbul timezone'unda. Birden fazla instance varsa
 * (load balancer arkası) cron lock mekanizması gerekir — şu an tek instance
 * varsayılıyor.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CashClosingScheduler {

    private final CashClosingRepository repository;
    private final CashClosingService closingService;
    private final NotificationService notificationService;
    private final UserRepository userRepository;

    /**
     * 19:30 reminder — bugün için CLOSED kapanış yoksa admin'lere push.
     * Cron: {@code 0 30 19 * * *} (saniye dakika saat gün ay haftaGünü)
     */
    @Scheduled(cron = "0 30 19 * * *", zone = "Europe/Istanbul")
    public void runReminder() {
        LocalDate today = LocalDate.now();
        Optional<CashClosing> existing = repository.findByClosingDate(today);
        if (existing.isPresent() && existing.get().getStatus() == CashClosingStatus.CLOSED) {
            log.debug("[closing-reminder] Bugün zaten kapatılmış — reminder atlanıyor.");
            return;
        }

        List<User> admins = userRepository.findByRoleIgnoreCase("admin");
        int sent = 0;
        for (User admin : admins) {
            try {
                notificationService.create(
                        admin.getId(),
                        NotificationType.WARNING,
                        "Kapanış hatırlatması",
                        "Günü henüz kapatmadın. 20:00'de sistem otomatik kapatacak.",
                        "/dashboard/kapanislar",
                        null,
                        "closing-reminder");
                sent++;
            } catch (Exception e) {
                log.warn("[closing-reminder] admin {} bildirim hatası: {}",
                        admin.getId(), e.getMessage());
            }
        }
        log.info("[closing-reminder] {} admin'e gönderildi (date={})", sent, today);
    }

    /**
     * 20:00 otomatik kapama — manuel yapılmadıysa.
     * Cron: {@code 0 0 20 * * *}
     */
    @Scheduled(cron = "0 0 20 * * *", zone = "Europe/Istanbul")
    public void runAutoClose() {
        LocalDate today = LocalDate.now();
        var result = closingService.autoCloseToday();
        if (result.isEmpty()) {
            log.debug("[auto-close] {} zaten kapatılmış — atlanıyor.", today);
            return;
        }

        // Bildirim
        List<User> admins = userRepository.findByRoleIgnoreCase("admin");
        int sent = 0;
        for (User admin : admins) {
            try {
                notificationService.create(
                        admin.getId(),
                        NotificationType.INFO,
                        "Gün otomatik kapatıldı",
                        "Manuel kapanış yapılmadığı için sistem 20:00'de günü otomatik kapattı.",
                        "/dashboard/kapanislar",
                        null,
                        "auto-closed");
                sent++;
            } catch (Exception e) {
                log.warn("[auto-close] admin {} bildirim hatası: {}",
                        admin.getId(), e.getMessage());
            }
        }
        log.info("[auto-close] {} otomatik kapatıldı + {} admin'e bildirim", today, sent);
    }
}
