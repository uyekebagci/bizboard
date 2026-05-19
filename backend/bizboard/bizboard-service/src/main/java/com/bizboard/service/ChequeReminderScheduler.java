package com.bizboard.service;

import com.bizboard.common.entity.Debt;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationType;
import com.bizboard.repository.DebtRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * v1.6.22 (WP-5): Çek vade reminder cron'u.
 *
 * <p>Her sabah 09:00 (Europe/Istanbul) {@code cheque_due_date - today IN (3, 1, 0)}
 * olan açık çekler için tüm admin'lere bildirim atar.</p>
 *
 * <p>Aynı gün ayrıca {@link CashClosingScheduler} 19:30 / 20:00 cron'ları çalışır
 * — bunlar bağımsız scheduler'lar.</p>
 *
 * <p>Reminder messages:</p>
 * <ul>
 *   <li>days == 0 → "X çekinin vadesi BUGUN"</li>
 *   <li>days == 1 → "X çekinin vadesi YARIN"</li>
 *   <li>days == 3 → "X çekinin vadesi 3 gun sonra"</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChequeReminderScheduler {

    private final DebtRepository debtRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;

    /** Cron: {@code 0 0 9 * * *} her sabah 09:00 İstanbul. */
    @Scheduled(cron = "0 0 9 * * *", zone = "Europe/Istanbul")
    public void runChequeReminders() {
        LocalDate today = LocalDate.now();
        int sent = 0;
        for (int days : new int[]{0, 1, 3}) {
            LocalDate target = today.plusDays(days);
            // findUpcomingCheques(from, to) tek günü de kapsar (BETWEEN inclusive)
            List<Debt> cheques = debtRepository.findUpcomingCheques(target, target);
            if (cheques.isEmpty()) continue;
            for (Debt c : cheques) {
                sent += notifyAdmins(c, days);
            }
        }
        log.info("[cheque-reminder] gün={} bildirim sayısı={}", today, sent);
    }

    private int notifyAdmins(Debt cheque, int daysUntilDue) {
        List<User> admins = userRepository.findByRoleIgnoreCase("admin");
        if (admins.isEmpty()) return 0;

        String counterpartName = displayCounterpartName(cheque);
        BigDecimal amount = cheque.getAmount();
        String amountStr = amount != null ? amount.toPlainString() + " " + cheque.getCurrency() : "?";
        String when = switch (daysUntilDue) {
            case 0  -> "BUGUN";
            case 1  -> "YARIN";
            default -> daysUntilDue + " gun sonra";
        };
        String title = "Çek vadesi yaklaşıyor: " + counterpartName;
        String message = counterpartName + " — " + amountStr
                + " — vade " + when
                + (cheque.getChequeNo() != null ? " · #" + cheque.getChequeNo() : "");

        int sent = 0;
        for (User admin : admins) {
            try {
                notificationService.create(
                        admin.getId(),
                        daysUntilDue == 0 ? NotificationType.ALERT : NotificationType.WARNING,
                        title,
                        message,
                        "/dashboard/cekler",
                        null,
                        "cheque-reminder-" + daysUntilDue);
                sent++;
            } catch (Exception e) {
                log.warn("[cheque-reminder] admin {} bildirim hatası: {}",
                        admin.getId(), e.getMessage());
            }
        }
        return sent;
    }

    private static String displayCounterpartName(Debt d) {
        if (d.getCounterpartRef() != null) return d.getCounterpartRef().getName();
        return d.getCounterparty();
    }
}
