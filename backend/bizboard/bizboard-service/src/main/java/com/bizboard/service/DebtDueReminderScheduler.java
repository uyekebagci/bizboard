package com.bizboard.service;

import com.bizboard.common.entity.Debt;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.DebtDirection;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.repository.DebtRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.notification.NotificationDispatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * WP f1fa3cd5 (otomasyon): Borç/alacak hatırlatma cron'u → {@code DEBT_DUE_SOON}.
 *
 * <p>Her sabah 09:00 (Europe/Istanbul): {@code reminder_date} bugün olan açık
 * (settled=false) borç/alacaklar için tüm admin'lere dispatch (in-app + opt-in
 * Telegram). ChequeReminderScheduler pattern'i; çek tarafı ondan ayrı kalır.</p>
 *
 * <p>Alacak (RECEIVABLE) → "tahsil hatırlatması", verecek (PAYABLE) → "ödeme
 * hatırlatması" — DEBT_DUE_SOON şablonu {counterparty}/{amount}/{when} ile.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DebtDueReminderScheduler {

    private final DebtRepository debtRepository;
    private final UserRepository userRepository;
    private final NotificationDispatchService dispatchService;

    /** Cron: {@code 0 0 9 * * *} her sabah 09:00 İstanbul. */
    @Scheduled(cron = "0 0 9 * * *", zone = "Europe/Istanbul")
    public void runDebtReminders() {
        LocalDate today = LocalDate.now();
        List<User> admins = userRepository.findByRoleIgnoreCase("admin");
        if (admins.isEmpty()) {
            log.info("[debt-reminder] admin yok, bildirim atlandı");
            return;
        }
        List<UUID> recipients = admins.stream().map(User::getId).toList();

        // reminder_date == bugün olan açık borç/alacaklar.
        List<Debt> due = debtRepository.findUpcomingReminders(today, today);
        int sent = 0;
        for (Debt d : due) {
            dispatchService.dispatch(
                    NotificationEvent.DEBT_DUE_SOON,
                    recipients,
                    Map.of(
                            "counterparty", displayName(d),
                            "amount", amountStr(d),
                            "currency", d.getCurrency() != null ? d.getCurrency() : "",
                            "when", "bugün"
                    ),
                    actionUrl(d),
                    d.getBusiness() != null ? d.getBusiness().getId() : null);
            sent++;
        }
        log.info("[debt-reminder] gün={} bildirim olayı sayısı={} alıcı={}",
                today, sent, recipients.size());
    }

    private static String actionUrl(Debt d) {
        return d.getDirection() == DebtDirection.RECEIVABLE
                ? "/dashboard/alacaklar" : "/dashboard/verecekler";
    }

    private static String amountStr(Debt d) {
        BigDecimal a = d.getRemainingAmount() != null ? d.getRemainingAmount() : d.getAmount();
        return a != null ? a.toPlainString() : "?";
    }

    private static String displayName(Debt d) {
        if (d.getCounterpartRef() != null) return d.getCounterpartRef().getName();
        return d.getCounterparty();
    }
}
