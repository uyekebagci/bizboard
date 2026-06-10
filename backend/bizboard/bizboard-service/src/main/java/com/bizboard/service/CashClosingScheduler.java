package com.bizboard.service;

import com.bizboard.common.entity.CashClosing;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.CashClosingStatus;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.repository.CashClosingRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.notification.NotificationDispatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

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
    // WP f1fa3cd5 (otomasyon): NotificationService.create yerine dispatch →
    // in-app + (opt-in) Telegram. Önceden dispatch bypass ediliyordu.
    private final NotificationDispatchService dispatchService;
    private final UserRepository userRepository;
    /** Ledger v2 (Faz B): otomatik gün devri (DayClose PENDING aç). */
    private final DayCloseService dayCloseService;

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

        List<UUID> recipients = userRepository.findByRoleIgnoreCase("admin")
                .stream().map(User::getId).toList();
        if (recipients.isEmpty()) return;
        dispatchService.dispatch(
                NotificationEvent.CASH_CLOSING_REMINDER,
                recipients,
                Map.of("date", today.toString()),
                "/dashboard/kapanislar",
                null);
        log.info("[closing-reminder] {} admin'e dispatch (date={})", recipients.size(), today);
    }

    /**
     * 20:00 otomatik kapama — manuel yapılmadıysa.
     * Cron: {@code 0 0 20 * * *}
     */
    @Scheduled(cron = "0 0 20 * * *", zone = "Europe/Istanbul")
    public void runAutoClose() {
        LocalDate today = LocalDate.now();

        // Ledger v2 (Faz B, §4 madde 2+6): otomatik gün devri — DayClose PENDING
        // aç (opening = önceki gün actual). Manuel devir hata kaynağıydı; bu
        // tamamen otomatik + tutarsızlık uyarısı (DayCloseService invariant).
        // Non-fatal: DayClose omurgası eski CashClosing akışını bloklamaz.
        try {
            var opened = dayCloseService.autoOpenToday();
            if (!opened.isEmpty()) {
                log.info("[day-close-auto] {} işletme için DayClose PENDING açıldı (devir)", opened.size());
            }
        } catch (Exception e) {
            log.warn("[day-close-auto] otomatik gün devri başarısız (non-fatal): {}", e.getMessage());
        }

        // v1.6.23.21: autoCloseToday artık tüm işletmeler için döner.
        var result = closingService.autoCloseToday();
        if (result.isEmpty()) {
            log.debug("[auto-close] {} — tüm işletmeler zaten kapatılmış, işlem yok.", today);
            return;
        }

        // Bildirim — GENERIC event (title+body) ile dispatch → in-app + Telegram.
        List<UUID> recipients = userRepository.findByRoleIgnoreCase("admin")
                .stream().map(User::getId).toList();
        if (!recipients.isEmpty()) {
            dispatchService.dispatch(
                    NotificationEvent.GENERIC,
                    recipients,
                    Map.of(
                            "title", "Gün otomatik kapatıldı",
                            "body", "Manuel kapanış yapılmadığı için sistem 20:00'de günü otomatik kapattı."
                    ),
                    "/dashboard/kapanislar",
                    null);
        }
        log.info("[auto-close] {} otomatik kapatıldı + {} admin'e dispatch", today, recipients.size());
    }
}
