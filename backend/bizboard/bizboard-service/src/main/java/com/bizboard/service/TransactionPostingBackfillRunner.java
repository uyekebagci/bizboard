package com.bizboard.service;

import com.bizboard.common.entity.Transaction;
import com.bizboard.repository.JournalEntryRepository;
import com.bizboard.repository.PostingRepository;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Ledger v2 (Faz A, §8.3) — mevcut tek-giriş {@code Transaction}'ları çift-giriş
 * Posting'e dönüştüren idempotent + non-fatal boot runner.
 *
 * <p><b>Marker:</b> {@link com.bizboard.common.entity.JournalEntry}'nin
 * {@code source_type + source_ref_id} alanı per-tx idempotency işaretidir —
 * bir tx için entry zaten varsa tekrar üretilmez (global flag DEĞİL; çift-koşturma
 * güvenli, kısmi-koşturma kaldığı yerden devam).</p>
 *
 * <p><b>Yıkıcı değil:</b> {@code Transaction} tablosu KAYNAK olarak korunur;
 * yalnız {@code journal_entries}/{@code postings} EKLENİR. Dengelenemeyen tx
 * FLAGGED loglanır (entry üretilmez — yarım/yetim posting yok). Backfill sonrası
 * Σ posting per entry = 0 invariant'ı doğrulanır.</p>
 *
 * <p><b>Geri-dönülebilir:</b> reversal için {@link LedgerPostingService
 * #reversePostingsForTransaction} (tx başına) veya tüm türetilmiş entry'leri
 * silmek (ileride ters-runner). Faz A'da reversal servis-seviyesinde hazırdır.</p>
 *
 * <p>Diğer migration runner'larından SONRA çalışır (Order 30) — kategori/firma/
 * hesap migration'ları posting türetmeden önce yerleşsin diye.</p>
 *
 * <p>v2.0.0'da Flyway/Liquibase'e taşınınca bu runner silinir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(30) // kategori (26/27) + hesap (14) migration'larından sonra
public class TransactionPostingBackfillRunner implements ApplicationRunner {

    private static final int PAGE_SIZE = 500;

    private final TransactionRepository transactionRepository;
    private final JournalEntryRepository journalEntryRepository;
    private final PostingRepository postingRepository;
    private final LedgerPostingService ledgerPostingService;

    @Override
    public void run(ApplicationArguments args) {
        log.info("[tx-posting-backfill] Starting Transaction -> Posting backfill...");
        try {
            long total = transactionRepository.count();
            if (total == 0) {
                log.info("[tx-posting-backfill] Transaction yok — atlaniyor.");
                return;
            }

            int derived = 0;
            int skipped = 0;   // zaten var (idempotent)
            int flagged = 0;   // dengelenemedi
            int pageIndex = 0;
            Page<Transaction> page;
            do {
                page = transactionRepository.findAll(
                        PageRequest.of(pageIndex, PAGE_SIZE, Sort.by("createdAt").ascending()));
                for (Transaction tx : page.getContent()) {
                    DeriveOutcome outcome = deriveOne(tx);
                    switch (outcome) {
                        case DERIVED -> derived++;
                        case SKIPPED -> skipped++;
                        case FLAGGED -> flagged++;
                    }
                }
                pageIndex++;
            } while (page.hasNext());

            long unbalanced = postingRepository.countUnbalancedEntries();
            log.info("[tx-posting-backfill] complete — toplam-tx: {}, turetildi: {}, "
                            + "zaten-var(skip): {}, FLAGGED(dengesiz/cozulemedi): {}, "
                            + "dengesiz-entry(invariant): {}.",
                    total, derived, skipped, flagged, unbalanced);
            if (unbalanced > 0) {
                log.error("[tx-posting-backfill] INVARIANT IHLALI — {} entry'de Σ posting ≠ 0; "
                        + "incele.", unbalanced);
            }
        } catch (Exception e) {
            log.error("[tx-posting-backfill] FAILED — backfill eksik kalabilir (non-fatal). Error:", e);
        }
    }

    /**
     * Tek tx için türetme dener. Hata izole (tek tx hatası tüm backfill'i bozmaz);
     * idempotency entry varlığıyla belirlenir.
     */
    private DeriveOutcome deriveOne(Transaction tx) {
        try {
            boolean existedBefore = journalEntryRepository.existsBySourceTypeAndSourceRefId(
                    com.bizboard.common.enums.JournalSourceType.MANUAL_TX, tx.getId())
                    || journalEntryRepository.existsBySourceTypeAndSourceRefId(
                    com.bizboard.common.enums.JournalSourceType.TRANSFER, tx.getId());
            if (existedBefore) {
                return DeriveOutcome.SKIPPED;
            }
            Optional<com.bizboard.common.entity.JournalEntry> entry =
                    ledgerPostingService.deriveForTransactionId(tx.getId());
            return entry.isPresent() ? DeriveOutcome.DERIVED : DeriveOutcome.FLAGGED;
        } catch (Exception e) {
            log.warn("[tx-posting-backfill] tx={} turetme hatasi (izole, atlaniyor): {}",
                    tx.getId(), e.getMessage());
            return DeriveOutcome.FLAGGED;
        }
    }

    private enum DeriveOutcome { DERIVED, SKIPPED, FLAGGED }
}
