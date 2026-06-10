package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.CashClosing;
import com.bizboard.common.entity.DayClose;
import com.bizboard.common.entity.DayCloseAccountCount;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.common.enums.CashClosingStatus;
import com.bizboard.common.enums.DayCloseCreatedVia;
import com.bizboard.common.enums.DayCloseStatus;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.CashClosingRepository;
import com.bizboard.repository.DayCloseRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §8.5) — {@code CashClosing} → {@code DayClose} migrate
 * (idempotent + non-fatal + reversible + log'lu, STRICT).
 *
 * <p><b>Karar (§3.6 / §8.5):</b> eski tek-kasa {@code CashClosing}
 * ({@code difference = actual − computed}) yeni çok-hesaplı {@code DayClose}'a
 * taşınır. İŞARET DÖNÜŞÜMÜ audit'lenir: yeni {@code variance = computed − actual}
 * (Excel konvansiyonu, KARAR A1) = eski {@code -difference}.</p>
 *
 * <p><b>Tek-hesap sayım:</b> eski {@code actualBalance} (tek nakit sayımı) →
 * business'in sistem "Genel Nakit" (CASH_HOLDER, is_system) hesabına tek
 * {@link DayCloseAccountCount} olarak taşınır. Sistem hesap yoksa sayım bağı
 * kurulmaz (DayClose yine de actualTotal ile taşınır; non-fatal).</p>
 *
 * <p><b>İdempotent:</b> aynı (business, close_date) için DayClose zaten varsa
 * tekrar üretilmez (skip). <b>Reversible:</b> {@code created_via=MIGRATED} olan
 * DayClose'lar {@link #reverse} ile silinebilir (orijinal CashClosing dokunulmaz).
 * Mevcut backfill / wait-list desenleri korunur — çift kaynak drift'i marker ile
 * önlenir.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CashClosingToDayCloseMigrationRunner {

    private final CashClosingRepository cashClosingRepository;
    private final DayCloseRepository dayCloseRepository;
    private final BankAccountRepository bankAccountRepository;
    private final AuditLogService auditLogService;

    /** Migration özeti. */
    public static final class MigrationReport {
        public int total;
        public int migrated;
        public int skippedExisting;
        public int skippedNonClosed;
        public int countLinked;
        public final List<String> notes = new ArrayList<>();

        public int getTotal() { return total; }
        public int getMigrated() { return migrated; }
        public int getSkippedExisting() { return skippedExisting; }
        public int getSkippedNonClosed() { return skippedNonClosed; }
        public int getCountLinked() { return countLinked; }
        public List<String> getNotes() { return notes; }
    }

    /**
     * Tüm {@code CashClosing}'leri {@code DayClose}'a migrate eder (idempotent).
     *
     * @param dryRun true ise hiçbir yazma yapılmaz; sadece analiz raporu döner.
     */
    @Transactional
    public MigrationReport migrate(boolean dryRun, UUID actorUserId, String actorName) {
        MigrationReport report = new MigrationReport();
        List<CashClosing> all = cashClosingRepository.findAll();
        report.total = all.size();

        for (CashClosing cc : all) {
            if (cc.getBusiness() == null || cc.getClosingDate() == null) {
                report.notes.add("skip: business/date null cc=" + cc.getId());
                continue;
            }
            UUID businessId = cc.getBusiness().getId();

            // İdempotency: bu gün için DayClose zaten varsa dokunma.
            if (dayCloseRepository.existsByBusinessIdAndCloseDate(businessId, cc.getClosingDate())) {
                report.skippedExisting++;
                continue;
            }
            // PENDING/REOPENED CashClosing → karşılığı PENDING DayClose; sayım taşınmaz.
            boolean closed = cc.getStatus() == CashClosingStatus.CLOSED;

            BigDecimal opening = nz(cc.getOpeningBalance());
            BigDecimal computed = nz(cc.getComputedClosing());
            BigDecimal actual = cc.getActualBalance(); // null olabilir (auto-close)
            // İşaret dönüşümü: yeni variance = computed − actual = -(eski difference).
            BigDecimal variance = actual != null ? computed.subtract(actual) : null;

            if (dryRun) {
                report.migrated++;
                report.notes.add("would migrate " + cc.getClosingDate()
                        + " variance(new)=" + variance + " (oldDiff=" + cc.getDifference() + ")");
                continue;
            }

            DayClose dc = DayClose.builder()
                    .business(cc.getBusiness())
                    .closeDate(cc.getClosingDate())
                    .status(closed ? DayCloseStatus.CLOSED : DayCloseStatus.PENDING)
                    .openingBalance(opening)
                    .totalIn(BigDecimal.ZERO)   // eski model in/out ayırmıyordu
                    .totalOut(BigDecimal.ZERO)
                    .computedClosing(computed)
                    .actualTotal(actual)
                    .variance(variance)
                    .alarmFired(false)
                    .backdated(false)
                    .createdVia(DayCloseCreatedVia.MIGRATED)
                    .reasonCategory(cc.getReasonCategory())
                    .reasonNote(cc.getReasonNote())
                    .closedBy(cc.getClosedBy())
                    .closedAt(cc.getClosedAt())
                    .build();

            // Tek-hesap sayım → sistem "Genel Nakit" CASH_HOLDER.
            if (closed && actual != null) {
                Optional<BankAccount> sysCash = systemCashAccount(businessId);
                if (sysCash.isPresent()) {
                    dc.getAccountCounts().add(DayCloseAccountCount.builder()
                            .dayClose(dc)
                            .account(sysCash.get())
                            .countedBalance(actual)
                            .computedBalance(computed)
                            .accountVariance(actual.subtract(computed))
                            .build());
                    report.countLinked++;
                } else {
                    report.notes.add("no system cash for business " + businessId
                            + " — DayClose actualTotal taşındı, count bağı yok");
                }
            }

            dayCloseRepository.save(dc);
            report.migrated++;
            if (!closed) report.skippedNonClosed++;
        }

        auditLogService.recordEntityAction(
                AuditAction.DAY_CLOSE_MIGRATED, actorUserId, actorName != null ? actorName : "system",
                "DAY_CLOSE", null,
                "CashClosing→DayClose migrate (dryRun=" + dryRun + "): "
                        + report.migrated + "/" + report.total + " (mevcut atlandı="
                        + report.skippedExisting + ")",
                java.util.Map.of(
                        "dryRun", dryRun,
                        "total", report.total,
                        "migrated", report.migrated,
                        "skippedExisting", report.skippedExisting,
                        "countLinked", report.countLinked),
                null);
        log.info("[cashclosing-migrate] dryRun={} total={} migrated={} skippedExisting={} countLinked={}",
                dryRun, report.total, report.migrated, report.skippedExisting, report.countLinked);
        return report;
    }

    /**
     * Reversible: {@code created_via=MIGRATED} DayClose'ları siler (orijinal
     * CashClosing'lere dokunmaz). İdempotent.
     */
    @Transactional
    public int reverse(UUID actorUserId, String actorName) {
        List<DayClose> migrated = dayCloseRepository.findAll().stream()
                .filter(dc -> dc.getCreatedVia() == DayCloseCreatedVia.MIGRATED)
                .toList();
        int removed = 0;
        for (DayClose dc : migrated) {
            dayCloseRepository.delete(dc); // cascade count'ları siler
            removed++;
        }
        auditLogService.recordEntityAction(
                AuditAction.DAY_CLOSE_MIGRATED, actorUserId, actorName != null ? actorName : "system",
                "DAY_CLOSE", null,
                "CashClosing→DayClose migrate REVERSE: " + removed + " DayClose silindi",
                java.util.Map.of("removed", removed), null);
        log.info("[cashclosing-migrate-reverse] removed={}", removed);
        return removed;
    }

    private Optional<BankAccount> systemCashAccount(UUID businessId) {
        return bankAccountRepository
                .findByActiveTrueAndBusinessIdInOrderByNameAsc(List.of(businessId))
                .stream()
                .filter(ba -> ba.isSystem() && ba.getType() == BankAccountType.CASH_HOLDER)
                .findFirst();
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
