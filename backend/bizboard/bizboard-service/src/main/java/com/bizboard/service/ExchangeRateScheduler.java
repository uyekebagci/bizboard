package com.bizboard.service;

import com.bizboard.repository.CounterpartRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * WP a9da4e9d (USD+Altın) — Strateji B: günlük kur tazeleme + recompute.
 *
 * <p>Her sabah 06:00 (Europe/Istanbul): canlı kuru çek (force) → tüm
 * counterpart'ların current_balance'ını yeniden hesapla (USD/GOLD borçlar güncel
 * kurla TL'ye döner). Manuel "Anlık Güncelle" butonu da aynı işi tetikler
 * ({@link #refreshAndRecompute}).</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ExchangeRateScheduler {

    private final ExchangeRateService exchangeRateService;
    private final CounterpartLedgerService counterpartLedger;
    private final CounterpartRepository counterpartRepository;

    /** Günlük: 06:00 İstanbul — kur çek + tüm cari bakiyeleri recompute. */
    @Scheduled(cron = "0 0 6 * * *", zone = "Europe/Istanbul")
    public void dailyRefresh() {
        refreshAndRecompute(true);
    }

    /**
     * Kuru tazele (force scheduled, manuelde cooldown'lu) + tüm counterpart
     * bakiyelerini recompute. Manuel buton {@code force=false} ile çağırır
     * (cooldown içinde dış API'ye gitmez, cache'ten servis eder).
     */
    public void refreshAndRecompute(boolean force) {
        exchangeRateService.refresh(force);
        int n = 0;
        for (var cp : counterpartRepository.findAll()) {
            try {
                counterpartLedger.recompute(cp.getId());
                n++;
            } catch (Exception e) {
                log.warn("[exchange-recompute] counterpart={} hata: {}", cp.getId(), e.getMessage());
            }
        }
        log.info("[exchange-recompute] {} counterpart bakiyesi güncel kurla yeniden hesaplandı.", n);
    }
}
