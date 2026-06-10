package com.bizboard.service;

import com.bizboard.common.entity.Transaction;
import com.bizboard.repository.JournalEntryRepository;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Ledger v2 (Faz A) — admin-tetikli backfill / dry-run / reversal orkestrasyonu.
 *
 * <p>Boot {@link TransactionPostingBackfillRunner} ile aynı türetme mantığını
 * ({@link LedgerPostingService}) on-demand sunar; admin mutabakat sırasında
 * yeniden koşturabilir (idempotent). Tüm mutate işlemler ADMIN-only controller
 * arkasında ({@code /admin/ledger/**}) + audit'li.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LedgerAdminService {

    private static final int PAGE_SIZE = 500;

    private final TransactionRepository transactionRepository;
    private final JournalEntryRepository journalEntryRepository;
    private final LedgerPostingService ledgerPostingService;

    /**
     * Dry-run: hiçbir şey PERSIST ETMEDEN tüm tx'leri tarar; kaçının dengeli
     * türetilebileceğini / FLAGGED olacağını raporlar. DB'ye dokunmaz (güvenli).
     */
    @Transactional(readOnly = true)
    public BackfillResult dryRunBackfill() {
        BackfillResult r = new BackfillResult(true);
        forEachTransaction(tx -> {
            boolean alreadyDerived = isAlreadyDerived(tx.getId());
            if (alreadyDerived) {
                r.skipped++;
            } else if (ledgerPostingService.wouldDeriveBalanced(tx)) {
                r.derived++;
            } else {
                r.flagged++;
            }
            r.total++;
        });
        log.info("[ledger-admin] dry-run — total={}, derivable={}, skip={}, flagged={}",
                r.total, r.derived, r.skipped, r.flagged);
        return r;
    }

    /**
     * Gerçek backfill (idempotent). Türetilmiş entry zaten varsa atlanır;
     * dengelenemeyen tx FLAGGED (entry üretilmez). Boot runner ile aynı sonuç.
     */
    @Transactional
    public BackfillResult runBackfill() {
        BackfillResult r = new BackfillResult(false);
        forEachTransaction(tx -> {
            try {
                if (isAlreadyDerived(tx.getId())) {
                    r.skipped++;
                } else {
                    boolean ok = ledgerPostingService.deriveForTransaction(tx).isPresent();
                    if (ok) r.derived++; else r.flagged++;
                }
            } catch (Exception e) {
                r.flagged++;
                log.warn("[ledger-admin] tx={} backfill hatasi (izole): {}", tx.getId(), e.getMessage());
            }
            r.total++;
        });
        log.info("[ledger-admin] backfill — total={}, derived={}, skip={}, flagged={}",
                r.total, r.derived, r.skipped, r.flagged);
        return r;
    }

    /**
     * Reversal: bir tx'in türetilmiş entry+posting'lerini siler (reversible).
     *
     * @return silinen entry sayısı.
     */
    @Transactional
    public int reverseForTransaction(UUID txId) {
        int removed = ledgerPostingService.reversePostingsForTransaction(txId);
        log.info("[ledger-admin] reverse tx={} — silinen-entry={}", txId, removed);
        return removed;
    }

    private boolean isAlreadyDerived(UUID txId) {
        return journalEntryRepository.existsBySourceTypeAndSourceRefId(
                com.bizboard.common.enums.JournalSourceType.MANUAL_TX, txId)
                || journalEntryRepository.existsBySourceTypeAndSourceRefId(
                com.bizboard.common.enums.JournalSourceType.TRANSFER, txId);
    }

    private void forEachTransaction(java.util.function.Consumer<Transaction> consumer) {
        int pageIndex = 0;
        Page<Transaction> page;
        do {
            page = transactionRepository.findAll(
                    PageRequest.of(pageIndex, PAGE_SIZE, Sort.by("createdAt").ascending()));
            for (Transaction tx : page.getContent()) {
                consumer.accept(tx);
            }
            pageIndex++;
        } while (page.hasNext());
    }

    /** Backfill / dry-run sonucu. */
    public static final class BackfillResult {
        public final boolean dryRun;
        public long total;
        public long derived;
        public long skipped;
        public long flagged;

        public BackfillResult(boolean dryRun) { this.dryRun = dryRun; }

        public boolean isDryRun() { return dryRun; }
        public long getTotal() { return total; }
        public long getDerived() { return derived; }
        public long getSkipped() { return skipped; }
        public long getFlagged() { return flagged; }
    }
}
