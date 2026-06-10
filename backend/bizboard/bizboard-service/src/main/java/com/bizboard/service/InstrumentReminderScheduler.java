package com.bizboard.service;

import com.bizboard.common.entity.Instrument;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.repository.InstrumentRepository;
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
 * Ledger v2 (Faz D, §3.7 / TODO 1) — çek/senet (Instrument) vade-yaklaşma
 * bildirimi cron'u.
 *
 * <p>Mevcut {@link ChequeReminderScheduler} v1.7 {@code Debt}-tabanlı çekleri
 * kapsar; bu cron Ledger v2 {@link Instrument} portföyünü kapsar. Aynı
 * {@link NotificationEvent#CHEQUE_DUE_SOON} olayını REUSE eder (yeni event/şablon
 * gerekmez) → hem in-app hem (opt-in) Telegram'a gider.</p>
 *
 * <p>Her sabah 09:05 (Europe/Istanbul) {@code due_date - today IN (3, 1, 0)} olan
 * CONFIRMED (takipteki) evraklar için tüm admin'lere bildirim.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InstrumentReminderScheduler {

    private final InstrumentRepository instrumentRepository;
    private final UserRepository userRepository;
    private final NotificationDispatchService dispatchService;

    /** Cron: {@code 0 5 9 * * *} her sabah 09:05 İstanbul (Debt cron'undan 5 dk sonra). */
    @Scheduled(cron = "0 5 9 * * *", zone = "Europe/Istanbul")
    public void runInstrumentReminders() {
        LocalDate today = LocalDate.now();
        List<User> admins = userRepository.findByRoleIgnoreCase("admin");
        if (admins.isEmpty()) {
            log.info("[instrument-reminder] admin yok, bildirim atlandı");
            return;
        }
        List<UUID> recipients = admins.stream().map(User::getId).toList();

        int sent = 0;
        for (int days : new int[]{0, 1, 3}) {
            LocalDate target = today.plusDays(days);
            List<Instrument> due = instrumentRepository.findUpcoming(target, target);
            for (Instrument ins : due) {
                dispatchService.dispatch(
                        NotificationEvent.CHEQUE_DUE_SOON,
                        recipients,
                        Map.of(
                                "counterparty", issuerName(ins),
                                "amount", amountStr(ins),
                                "currency", ins.getCurrency() != null ? ins.getCurrency() : "",
                                "when", whenLabel(days),
                                "chequeNo", ins.getSerialNo() != null ? " · #" + ins.getSerialNo() : ""
                        ),
                        "/dashboard/cekler",
                        ins.getBusiness() != null ? ins.getBusiness().getId() : null);
                sent++;
            }
        }
        log.info("[instrument-reminder] gün={} bildirim olayı sayısı={} alıcı={}",
                today, sent, recipients.size());
    }

    private static String whenLabel(int daysUntilDue) {
        return switch (daysUntilDue) {
            case 0 -> "BUGUN";
            case 1 -> "YARIN";
            default -> daysUntilDue + " gun sonra";
        };
    }

    private static String amountStr(Instrument ins) {
        BigDecimal amount = ins.getAmount();
        return amount != null ? amount.toPlainString() : "?";
    }

    private static String issuerName(Instrument ins) {
        return ins.getIssuerCounterpart() != null ? ins.getIssuerCounterpart().getName() : "—";
    }
}
