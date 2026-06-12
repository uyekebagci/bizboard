package com.bizboard.service.ai;

import com.bizboard.common.entity.Business;
import com.bizboard.repository.BusinessRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * AI modülü (v1.1): anomali tespiti scheduler'ı (CashClosingScheduler deseni).
 *
 * <p>Cron Europe/Istanbul; varsayılan her gün 07:15 ({@code app.ai.anomaly.cron}).
 * Tüm işletmeleri dolaşır; yalnız AI anomali bayrağı açık olanlar (per-business
 * opt-in, DEFAULT KAPALI) taranır — {@link AnomalyDetectionService#scanBusiness}.</p>
 *
 * <p>Global bayraklar kapalıysa ({@code app.ai.enabled} veya
 * {@code app.ai.anomaly.enabled}) job hiçbir şey yapmaz. Best-effort: bir
 * işletme patlasa diğerlerini engellemez.</p>
 *
 * <p>Tek instance varsayılır (mevcut scheduler'larla aynı varsayım); birden
 * fazla instance'ta cron-lock gerekir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AnomalyScheduler {

    private final BusinessRepository businessRepository;
    private final AnomalyDetectionService anomalyService;
    private final AiProperties props;

    @Scheduled(cron = "${app.ai.anomaly.cron:0 15 7 * * *}", zone = "Europe/Istanbul")
    public void runDailyScan() {
        if (!props.isEnabled() || !props.getAnomaly().isEnabled()) {
            return; // global olarak kapalı — sessiz çık.
        }
        List<Business> businesses;
        try {
            businesses = businessRepository.findAll();
        } catch (Exception e) {
            log.warn("[ai-anomaly-cron] işletme listesi alınamadı: {}", e.getMessage());
            return;
        }

        int totalAlerts = 0;
        int scanned = 0;
        for (Business b : businesses) {
            try {
                int fired = anomalyService.scanBusiness(b.getId());
                if (anomalyService.isEnabledForBusiness(b.getId())) scanned++;
                totalAlerts += fired;
            } catch (Exception e) {
                log.warn("[ai-anomaly-cron] business={} tarama hatası: {}", b.getId(), e.getMessage());
            }
        }
        log.info("[ai-anomaly-cron] tarama tamam — opt-in işletme={}, yeni uyarı={}", scanned, totalAlerts);
    }
}
