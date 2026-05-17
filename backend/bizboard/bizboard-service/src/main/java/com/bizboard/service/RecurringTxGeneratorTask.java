package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * v1.5.9: her ayın 1'i 02:30 Europe/Istanbul'da çalışan recurring tx jeneratör
 * scheduled task'i.
 *
 * <p>Cron: {@code 0 30 2 1 * *} = saniye 0, dakika 30, saat 02, ayın 1'i.
 * Env üzerinden override edilebilir: {@code APP_RECURRING_TX_CRON}.</p>
 *
 * <p>Idempotency {@link RecurringTxGeneratorService}'te FixedCost.lastAutoRun ile
 * sağlanır; cron hatası veya manuel test sırasında çift tetiklenme tx duplikasyonu
 * yaratmaz.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RecurringTxGeneratorTask {

    private final RecurringTxGeneratorService service;

    @Scheduled(cron = "${app.recurring.tx.cron:0 30 2 1 * *}", zone = "Europe/Istanbul")
    public void generate() {
        try {
            RecurringTxGeneratorService.GenerationResult r =
                    service.run(LocalDateTime.now(), null, "system");
            log.info("[recurring-tx-task] processed={} created={} skipped={}",
                    r.processed(), r.created(), r.skipped());
        } catch (Exception e) {
            log.warn("[recurring-tx-task] failed: {}", e.getMessage(), e);
        }
    }
}
