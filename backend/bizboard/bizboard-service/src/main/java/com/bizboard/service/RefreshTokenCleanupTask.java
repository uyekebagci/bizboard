package com.bizboard.service;

import com.bizboard.repository.RefreshTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Expired refresh token kayıtlarını DB'den silen periyodik temizlik görevi.
 *
 * <p>Refresh token tablosu doğrudan büyüme eğilimindedir; her rotation eski
 * kaydı {@code revoked=true} bırakıp yenisini ekler. Cleanup, kullanım süresi
 * tamamen dolanları (expired) siler. Revoke edilmiş ama henüz expire olmamış
 * kayıtlar saklı kalır — theft detection zinciri için lazımlar.</p>
 *
 * <p>Zamanlama: Her gün UTC 03:30 ({@code Europe/Istanbul} 06:30). Bu saatte
 * yük en az.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RefreshTokenCleanupTask {

    private final RefreshTokenRepository repository;

    /**
     * Cron: saniye-dakika-saat-gün-ay-haftaGünü.
     * "0 30 3 * * *" = her gün 03:30:00 (sunucu timezone = Europe/Istanbul).
     */
    @Scheduled(cron = "${app.refresh.cleanup.cron:0 30 3 * * *}", zone = "Europe/Istanbul")
    @Transactional
    public void deleteExpiredTokens() {
        LocalDateTime now = LocalDateTime.now();
        try {
            long deleted = repository.deleteExpiredBefore(now);
            log.info("[refresh-cleanup] purged {} expired refresh tokens (cutoff={})", deleted, now);
        } catch (Exception e) {
            // Tek bir başarısızlık bir sonraki gün otomatik yeniden denenir; alarm üretme.
            log.warn("[refresh-cleanup] failed: {}", e.getMessage());
        }
    }
}
