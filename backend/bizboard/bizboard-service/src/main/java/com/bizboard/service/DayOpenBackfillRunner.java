package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.DayClose;
import com.bizboard.common.entity.DayOpen;
import com.bizboard.common.enums.DayCloseStatus;
import com.bizboard.common.enums.DayOpenCreatedVia;
import com.bizboard.common.enums.DayOpenStatus;
import com.bizboard.repository.DayCloseRepository;
import com.bizboard.repository.DayOpenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B — Gün Açılışı) — geriye-uyum backfill (idempotent + non-fatal
 * + reversible + log'lu, STRICT).
 *
 * <p><b>Amaç:</b> DayOpen omurgası YENİ; geçmiş günler "Günü Aç" akışından
 * geçmedi. Mevcut CLOSED {@code DayClose}'lar için karşılık gelen bir
 * {@code DayOpen} yok → birleşik gün durumu (lifecycle) onları AÇILMAMIŞ
 * gösterebilir (yanlış). Bu runner her CLOSED DayClose için
 * {@code created_via=CLOSE_SYNC} bir {@code DayOpen.CLOSED} kaydı üretir →
 * geçmiş günler doğru "KAPALI" raporlanır.</p>
 *
 * <p><b>İdempotent:</b> (business, date) için DayOpen zaten varsa atlanır.
 * <b>Reversible:</b> {@code created_via=CLOSE_SYNC} kayıtlar {@link #reverse}
 * ile silinir (manuel açılışlara DOKUNMAZ). <b>Non-fatal:</b> her satır izole;
 * hata logblanır, akış sürer. <b>Yuvarlama posting'i ÜRETMEZ</b> — CLOSE_SYNC
 * kayıtları roundedTotal=0 taşır, opening fallback'i (prior-actual) korunur
 * (DGR / mevcut SAĞLAMA HESAP zinciri bozulmaz).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DayOpenBackfillRunner {

    private final DayCloseRepository dayCloseRepository;
    private final DayOpenRepository dayOpenRepository;
    private final AuditLogService auditLogService;

    public static final class BackfillReport {
        public int totalClosed;
        public int created;
        public int skippedExisting;
        public final List<String> notes = new ArrayList<>();

        public int getTotalClosed() { return totalClosed; }
        public int getCreated() { return created; }
        public int getSkippedExisting() { return skippedExisting; }
        public List<String> getNotes() { return notes; }
    }

    /**
     * Tüm CLOSED DayClose'lar için CLOSE_SYNC DayOpen üretir (idempotent).
     *
     * @param dryRun true → yazma yok; yalnız analiz raporu.
     */
    @Transactional
    public BackfillReport backfill(boolean dryRun, UUID actorUserId, String actorName) {
        BackfillReport report = new BackfillReport();
        List<DayClose> closed = dayCloseRepository.findAll().stream()
                .filter(dc -> dc.getStatus() == DayCloseStatus.CLOSED
                        && dc.getBusiness() != null && dc.getCloseDate() != null)
                .toList();
        report.totalClosed = closed.size();

        for (DayClose dc : closed) {
            try {
                UUID businessId = dc.getBusiness().getId();
                if (dayOpenRepository.existsByBusinessIdAndOpenDate(businessId, dc.getCloseDate())) {
                    report.skippedExisting++;
                    continue;
                }
                if (dryRun) {
                    report.created++;
                    report.notes.add("would create CLOSE_SYNC " + dc.getCloseDate());
                    continue;
                }
                Business business = dc.getBusiness();
                DayOpen synced = DayOpen.builder()
                        .business(business)
                        .openDate(dc.getCloseDate())
                        .status(DayOpenStatus.CLOSED)
                        .createdVia(DayOpenCreatedVia.CLOSE_SYNC)
                        .closedAt(dc.getClosedAt() != null ? dc.getClosedAt() : LocalDateTime.now())
                        .build();
                dayOpenRepository.save(synced);
                report.created++;
            } catch (Exception e) {
                report.notes.add("skip(error) dc=" + dc.getId() + ": " + e.getMessage());
                log.warn("[day-open-backfill] satır hatası (izole, atlandı) dc={}: {}",
                        dc.getId(), e.getMessage());
            }
        }

        auditLogService.recordEntityAction(
                AuditAction.DAY_OPEN_CLOSED_SYNC, actorUserId,
                actorName != null ? actorName : "system",
                "DAY_OPEN", null,
                "DayOpen CLOSE_SYNC backfill (dryRun=" + dryRun + "): "
                        + report.created + "/" + report.totalClosed
                        + " (mevcut atlandı=" + report.skippedExisting + ")",
                java.util.Map.of(
                        "dryRun", dryRun,
                        "totalClosed", report.totalClosed,
                        "created", report.created,
                        "skippedExisting", report.skippedExisting),
                null);
        log.info("[day-open-backfill] dryRun={} totalClosed={} created={} skippedExisting={}",
                dryRun, report.totalClosed, report.created, report.skippedExisting);
        return report;
    }

    /**
     * Reversible: {@code created_via=CLOSE_SYNC} DayOpen'ları siler (manuel/
     * backdated açılışlara DOKUNMAZ). İdempotent.
     */
    @Transactional
    public int reverse(UUID actorUserId, String actorName) {
        List<DayOpen> synced = dayOpenRepository.findByCreatedVia(DayOpenCreatedVia.CLOSE_SYNC);
        int removed = 0;
        for (DayOpen d : synced) {
            dayOpenRepository.delete(d);
            removed++;
        }
        auditLogService.recordEntityAction(
                AuditAction.DAY_OPEN_CLOSED_SYNC, actorUserId,
                actorName != null ? actorName : "system",
                "DAY_OPEN", null,
                "DayOpen CLOSE_SYNC backfill REVERSE: " + removed + " kayıt silindi",
                java.util.Map.of("removed", removed), null);
        log.info("[day-open-backfill-reverse] removed={}", removed);
        return removed;
    }
}
