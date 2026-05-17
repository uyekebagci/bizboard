package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.DebtMigrationResultDto;
import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.entity.Debt;
import com.bizboard.common.enums.CounterpartRole;
import com.bizboard.repository.CounterpartRepository;
import com.bizboard.repository.DebtRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * v1.5.0 öncesi free-text {@code debt.counterparty} string'i ile oluşturulmuş
 * borçları normalize {@link Counterpart} kayıtlarına bağlayan migration.
 *
 * <p>Davranış:</p>
 * <ul>
 *   <li>{@code counterpart_id IS NULL && counterparty IS NOT NULL/blank} olan
 *       tüm borçları toplar.</li>
 *   <li>Her birinde, counterparty string'inin case-insensitive eşleşmesini
 *       Counterpart kayıtlarında arar.</li>
 *   <li>Bulunursa → o counterpart'a bağlar.</li>
 *   <li>Bulunamazsa ve {@code autoCreate=true} ise yeni counterpart oluşturur
 *       (role=OTHER varsayılan); aksi halde atlanır.</li>
 *   <li>Dry-run modu: hiçbir mutation yapılmaz, sadece sayım döner.</li>
 *   <li>Etkilenen counterpart'lar için ledger recompute tetiklenir (gerçek
 *       run'da).</li>
 * </ul>
 *
 * <p>Idempotent — bir kez çalıştırıldıktan sonra orphan borç kalmazsa
 * sonraki run'lar no-op olur.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DebtMigrationService {

    private final DebtRepository debtRepository;
    private final CounterpartRepository counterpartRepository;
    private final CounterpartLedgerService counterpartLedger;
    private final AuditLogService auditLogService;

    @Transactional
    public DebtMigrationResultDto migrateCounterparts(boolean dryRun, boolean autoCreate, UUID actorUserId, String actorUsername) {
        int orphan = 0, matched = 0, created = 0, skipped = 0;
        Set<UUID> touchedCounterparts = new HashSet<>();

        // İçinde counterpart_id null olan borçlar — migration kaynağı.
        for (Debt d : debtRepository.findByCounterpartRefIsNull()) {
            orphan++;
            String raw = d.getCounterparty();
            if (raw == null || raw.isBlank()) {
                skipped++;
                continue;
            }
            String name = raw.trim();

            // Mevcut counterpart'ı case-insensitive ara.
            Counterpart match = counterpartRepository.findFirstByNameIgnoreCase(name).orElse(null);

            if (match == null && !autoCreate) {
                skipped++;
                continue;
            }

            if (match == null) {
                // Auto-create
                if (dryRun) {
                    created++;
                    continue;
                }
                match = counterpartRepository.save(Counterpart.builder()
                        .name(name)
                        .role(CounterpartRole.OTHER)
                        .currentBalance(BigDecimal.ZERO)
                        .paymentTermsDays(0)
                        .build());
                created++;
                log.info("[debt-migration] yeni counterpart olusturuldu: {} (id={})", name, match.getId());
            } else {
                matched++;
            }

            if (!dryRun) {
                d.setCounterpartRef(match);
                debtRepository.save(d);
                touchedCounterparts.add(match.getId());
            }
        }

        // Etkilenen counterpart'ların bakiyelerini recompute et.
        int recomputed = 0;
        if (!dryRun) {
            for (UUID cpId : touchedCounterparts) {
                counterpartLedger.recomputeIfPresent(cpId);
                recomputed++;
            }
        }

        DebtMigrationResultDto result = DebtMigrationResultDto.builder()
                .dryRun(dryRun)
                .orphanDebts(orphan)
                .matchedExisting(matched)
                .createdNew(created)
                .skipped(skipped)
                .recomputedCounterparts(recomputed)
                .build();

        log.info("[debt-migration] dryRun={} orphan={} matched={} created={} skipped={} recomputed={}",
                dryRun, orphan, matched, created, skipped, recomputed);

        // Audit log — sadece gerçek run kaydedilir (dry-run sessiz).
        if (!dryRun && (matched + created) > 0) {
            Map<String, Object> meta = new HashMap<>();
            meta.put("orphanDebts", orphan);
            meta.put("matchedExisting", matched);
            meta.put("createdNew", created);
            meta.put("skipped", skipped);
            meta.put("recomputedCounterparts", recomputed);
            meta.put("autoCreate", autoCreate);
            auditLogService.recordEntityAction(
                    AuditAction.DEBT_MIGRATION,
                    actorUserId, actorUsername,
                    "DEBT", null,
                    "Borc counterpart migration: " + (matched + created) + " borc baglandi, " + created + " yeni firma",
                    meta);
        }

        return result;
    }

    /** Lowercase normalize key — case + boşluk insensitive eşleşme için. */
    @SuppressWarnings("unused")
    private static String normalizeKey(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT);
    }
}
