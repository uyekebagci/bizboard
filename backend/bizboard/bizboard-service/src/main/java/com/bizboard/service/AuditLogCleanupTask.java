package com.bizboard.service;

import com.bizboard.repository.AuditLogRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * X günden eski audit_log kayıtlarını periyodik olarak silen retention görevi.
 *
 * <p>Audit tablosu yüksek-volume yazılan bir tablodur (her CRUD aksiyonu, her login
 * denemesi, her dosya işlemi); kalıcı saklanırsa DB hızla şişer. Bu görev günlük
 * çalışır ve {@code app.audit.retention-days} (default 90) günden eski kayıtları
 * toplu silinir.</p>
 *
 * <p>Zamanlama: Her gün UTC 03:45 ({@code Europe/Istanbul} 03:45). Refresh token
 * cleanup'tan (03:30) hemen sonra; düşük-trafik penceresinde tek seferde temizlenir.
 * Cron override env: {@code APP_AUDIT_CLEANUP_CRON}.</p>
 *
 * <p>{@code app.audit.retention-days = 0} verilirse görev iptal edilir (kayıtlar
 * süresiz saklanır). Bu mod testler veya forensic kullanımda işe yarar.</p>
 */
@Slf4j
@Component
public class AuditLogCleanupTask {

    private final AuditLogRepository repository;
    private final AuditAnonymizationService anonymizationService;
    private final int retentionDays;
    private final long anonymizeAfterDays;

    public AuditLogCleanupTask(AuditLogRepository repository,
                               AuditAnonymizationService anonymizationService,
                               @Value("${app.audit.retention-days:90}") int retentionDays,
                               @Value("${app.audit.anonymize-after-days:0}") long anonymizeAfterDays) {
        this.repository = repository;
        this.anonymizationService = anonymizationService;
        this.retentionDays = retentionDays;
        this.anonymizeAfterDays = anonymizeAfterDays;
    }

    @Scheduled(cron = "${app.audit.cleanup.cron:0 45 3 * * *}", zone = "Europe/Istanbul")
    public void purgeOldAuditLogs() {
        // mod-audit: KVKK retention politikası — önce anonimleştir (kayıt korunur,
        // PII kaldırılır), sonra retention süresi dolanları sil. Anonimleştirme
        // penceresi (anonymize-after-days) genelde silme penceresinden (retention-days)
        // KISA tutulur: PII erken kaldırılır, yapısal forensik iz daha uzun kalır.
        runAnonymization();
        runPurge();
    }

    /** PII anonimleştirme pass'i (config'le açılır; 0 = kapalı). Non-fatal. */
    private void runAnonymization() {
        if (anonymizeAfterDays <= 0) {
            return; // kapalı
        }
        try {
            AuditAnonymizationService.AnonymizeResult r =
                    anonymizationService.anonymizeOlderThan(anonymizeAfterDays);
            log.info("[audit-cleanup] anonymize: {}", r.message());
        } catch (Exception e) {
            log.warn("[audit-cleanup] anonymize failed (non-fatal): {}", e.getMessage());
        }
    }

    /** Retention süresi dolan kayıtları siler (config'le; 0 = süresiz sakla). */
    @Transactional
    public void runPurge() {
        if (retentionDays <= 0) {
            log.info("[audit-cleanup] purge disabled (retentionDays={})", retentionDays);
            return;
        }
        LocalDateTime cutoff = LocalDateTime.now().minusDays(retentionDays);
        try {
            long deleted = repository.deleteCreatedBefore(cutoff);
            log.info("[audit-cleanup] purged {} audit log rows older than {} ({} days retention)",
                    deleted, cutoff, retentionDays);
        } catch (Exception e) {
            // Cleanup başarısızlığı kritik değil; bir sonraki gün otomatik retry.
            log.warn("[audit-cleanup] failed: {}", e.getMessage());
        }
    }
}
