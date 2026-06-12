package com.bizboard.service;

import com.bizboard.common.entity.Business;
import com.bizboard.repository.BusinessRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Düşük-bakiye PERİYODİK tarama scheduler'ı (Tier 2 tamamlayıcı).
 *
 * <p>Tier 2'deki {@code BALANCE_BELOW_THRESHOLD} alarmı event-driven'dı (yalnız
 * bir işlem bakiyeyi değiştirdiğinde değerlendirilirdi). Bu scheduler periyodik
 * (varsayılan her sabah 08:00, Europe/Istanbul) TÜM işletmeleri tarar ve
 * {@link FinancialAlertService#onBalanceChanged} ile eşik-altı hesapları
 * değerlendirir. Böylece bakiyeyi değiştiren bir işlem olmadan da (ör. eşik
 * sonradan yükseltilince) uyarı yakalanır.</p>
 *
 * <p><b>DEFAULT KAPALI</b> (spam-kaçın): {@code app.lowbalance.scan.enabled}
 * yalnızca açıkça {@code true} yapılırsa çalışır. Kapalıyken job sessizce çıkar.
 * Açık olsa bile işletme-başına bakiye eşiği set edilmemişse (DEFAULT 0/kapalı)
 * o işletme için no-op'tur; debounce sayesinde zaten uyarılmış (BELOW durumdaki)
 * işletme tekrar uyarılmaz.</p>
 *
 * <p>Tek instance varsayılır (mevcut scheduler'larla aynı varsayım).</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LowBalanceScanScheduler {

    private final BusinessRepository businessRepository;
    private final FinancialAlertService financialAlertService;
    private final Environment env;

    @Scheduled(cron = "${app.lowbalance.scan.cron:0 0 8 * * *}", zone = "Europe/Istanbul")
    public void runDailyScan() {
        boolean enabled = env.getProperty("app.lowbalance.scan.enabled", Boolean.class, Boolean.FALSE);
        if (!enabled) return; // DEFAULT KAPALI — sessiz çık.

        List<Business> businesses;
        try {
            businesses = businessRepository.findAll();
        } catch (Exception e) {
            log.warn("[lowbalance-cron] işletme listesi alınamadı: {}", e.getMessage());
            return;
        }

        int scanned = 0;
        for (Business b : businesses) {
            try {
                // onBalanceChanged eşik-yok/0 ise no-op; debounce ile tekrar uyarmaz.
                financialAlertService.onBalanceChanged(b);
                scanned++;
            } catch (Exception e) {
                log.warn("[lowbalance-cron] business={} tarama hatası: {}", b.getId(), e.getMessage());
            }
        }
        log.info("[lowbalance-cron] tarama tamam — taranan işletme={}", scanned);
    }
}
