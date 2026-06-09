package com.bizboard.service.taxcalendar;

import com.bizboard.common.dto.TaxDeadlineDto;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.notification.NotificationDispatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Vergi Takvimi Modülü — yaklaşan vergi son tarihleri için reminder cron'u.
 *
 * <p>Her sabah 09:00 (Europe/Istanbul) {@code dueDate - today IN (7, 3, 1)} olan
 * vergi son tarihleri için tüm admin'lere {@link NotificationEvent#TAX_DEADLINE_DUE_SOON}
 * bildirimi atar. Bildirim {@link NotificationDispatchService} üzerinden gider —
 * IN_APP varsayılan açık, harici kanallar (email/telegram) kullanıcı opt-in'ine bağlı.</p>
 *
 * <p>Pattern {@code ChequeReminderScheduler} ile aynı; tek fark olay tipi ve kaynak.
 * Best-effort: bir alıcı/kanal hatası diğerlerini engellemez (dispatch katmanında
 * yakalanır).</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TaxDeadlineReminderScheduler {

    private static final int[] REMINDER_DAYS = {7, 3, 1};

    private final TaxCalendarService taxCalendarService;
    private final UserRepository userRepository;
    private final NotificationDispatchService dispatchService;

    /** Cron: {@code 0 0 9 * * *} her sabah 09:00 İstanbul. */
    @Scheduled(cron = "0 0 9 * * *", zone = "Europe/Istanbul")
    public void runTaxDeadlineReminders() {
        LocalDate today = LocalDate.now();
        List<User> admins = userRepository.findByRoleIgnoreCase("admin");
        if (admins.isEmpty()) {
            log.info("[tax-reminder] admin yok, bildirim atlandı");
            return;
        }
        List<java.util.UUID> recipients = admins.stream().map(User::getId).toList();

        int sent = 0;
        for (int days : REMINDER_DAYS) {
            LocalDate target = today.plusDays(days);
            List<TaxDeadlineDto> due = taxCalendarService.deadlinesBetween(target, target);
            for (TaxDeadlineDto d : due) {
                dispatchService.dispatch(
                        NotificationEvent.TAX_DEADLINE_DUE_SOON,
                        recipients,
                        Map.of(
                                "tax", d.getLabel(),
                                "period", d.getPeriod(),
                                "when", whenLabel(days),
                                "dueDate", d.getDueDate().toString()
                        ),
                        "/dashboard/vergi-takvimi",
                        null);
                sent++;
            }
        }
        log.info("[tax-reminder] gün={} bildirim olayı sayısı={} alıcı={}",
                today, sent, recipients.size());
    }

    private static String whenLabel(int daysUntilDue) {
        return switch (daysUntilDue) {
            case 1 -> "YARIN";
            default -> daysUntilDue + " gün sonra";
        };
    }
}
