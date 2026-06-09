package com.bizboard.service;

import com.bizboard.common.entity.Debt;
import com.bizboard.common.entity.User;
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
 * v1.6.22 (WP-5): Çek vade reminder cron'u.
 *
 * <p>WP f1fa3cd5 (otomasyon): Artık {@link NotificationDispatchService} ile
 * {@code CHEQUE_DUE_SOON} dispatch eder — hem in-app hem (opt-in) Telegram'a gider.
 * Önceden {@code NotificationService.create()} (in-app only) çağırıyor, dispatch'i
 * bypass ediyordu → Telegram'a hiç gitmiyordu.</p>
 *
 * <p>Her sabah 09:00 (Europe/Istanbul) {@code cheque_due_date - today IN (3, 1, 0)}
 * olan açık çekler için tüm admin'lere bildirim.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChequeReminderScheduler {

    private final DebtRepository debtRepository;
    private final UserRepository userRepository;
    private final NotificationDispatchService dispatchService;

    /** Cron: {@code 0 0 9 * * *} her sabah 09:00 İstanbul. */
    @Scheduled(cron = "0 0 9 * * *", zone = "Europe/Istanbul")
    public void runChequeReminders() {
        LocalDate today = LocalDate.now();
        List<User> admins = userRepository.findByRoleIgnoreCase("admin");
        if (admins.isEmpty()) {
            log.info("[cheque-reminder] admin yok, bildirim atlandı");
            return;
        }
        List<UUID> recipients = admins.stream().map(User::getId).toList();

        int sent = 0;
        for (int days : new int[]{0, 1, 3}) {
            LocalDate target = today.plusDays(days);
            // findUpcomingCheques(from, to) tek günü de kapsar (BETWEEN inclusive)
            List<Debt> cheques = debtRepository.findUpcomingCheques(target, target);
            for (Debt c : cheques) {
                dispatchService.dispatch(
                        NotificationEvent.CHEQUE_DUE_SOON,
                        recipients,
                        Map.of(
                                "counterparty", displayCounterpartName(c),
                                "amount", amountStr(c),
                                "currency", c.getCurrency() != null ? c.getCurrency() : "",
                                "when", whenLabel(days),
                                "chequeNo", c.getChequeNo() != null ? " · #" + c.getChequeNo() : ""
                        ),
                        "/dashboard/cekler",
                        c.getBusiness() != null ? c.getBusiness().getId() : null);
                sent++;
            }
        }
        log.info("[cheque-reminder] gün={} bildirim olayı sayısı={} alıcı={}",
                today, sent, recipients.size());
    }

    private static String whenLabel(int daysUntilDue) {
        return switch (daysUntilDue) {
            case 0  -> "BUGUN";
            case 1  -> "YARIN";
            default -> daysUntilDue + " gun sonra";
        };
    }

    private static String amountStr(Debt cheque) {
        BigDecimal amount = cheque.getAmount();
        return amount != null ? amount.toPlainString() : "?";
    }

    private static String displayCounterpartName(Debt d) {
        if (d.getCounterpartRef() != null) return d.getCounterpartRef().getName();
        return d.getCounterparty();
    }
}
