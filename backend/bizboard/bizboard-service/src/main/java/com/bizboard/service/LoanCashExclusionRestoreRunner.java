package com.bizboard.service;

import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.JournalEntry;
import com.bizboard.common.entity.Posting;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.JournalSourceType;
import com.bizboard.common.enums.PostingLegKind;
import com.bizboard.common.enums.TransactionKind;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.JournalEntryRepository;
import com.bizboard.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * FİNANSAL KURAL RESTORASYONU (kullanıcı onayı Z, 2026-06) — tahsilat/LOAN
 * tx'lerinin OPERASYONEL KASAYA (Genel Kasa = nakit + banka) bıraktığı HAYALİ
 * bakiye etkisini idempotent olarak temizler.
 *
 * <h2>Neden gerekli</h2>
 * <p>Kural değişikliğinden ÖNCE oluşmuş {@code kind=LOAN} tahsilat/borç tx'leri:</p>
 * <ul>
 *   <li>Kasa snapshot'ını ({@code bank_accounts.current_balance}) bumplamıştı
 *       ({@code PaymentService}/{@code LoanService} eski davranış).</li>
 *   <li>Posting omurgasında gerçek kasa hesabına bir {@code LOCATION_MOVE}
 *       bacağı yazmıştı ({@code LedgerPostingService} eski davranış) → posting-
 *       türetilen bakiye de LOAN'ı sayıyordu.</li>
 * </ul>
 * <p>DGR örneği: 3 hayali tahsilat (toplam 6.699.000) Genel Kasa'yı şişirdi.</p>
 *
 * <h2>Ne yapar (idempotent, non-fatal)</h2>
 * <ol>
 *   <li><b>LOAN posting'lerini YENİDEN TÜRET:</b> {@code source_type=TRANSFER}
 *       (LOAN+TRANSFER paylaşır) entry'lerini tarar; kaynak tx {@code kind=LOAN}
 *       ise eski entry'yi ters alır ({@code reversePostingsForTransaction}) ve
 *       yeni kuralla ({@code LedgerPostingService}: her iki bacak account=NULL)
 *       yeniden türetir. Sonuç: LOAN artık gerçek kasa hesabına posting BIRAKMAZ.
 *       Tx'in KENDİSİ SİLİNMEZ (cari/loan ledger'da kalır).</li>
 *   <li><b>Kasa snapshot'ından LOAN delta'sını DÜŞ:</b> 1. adımda HER gerçek
 *       kasa hesabına LOAN'ın yazdığı eski {@code LOCATION_MOVE} bacaklarının
 *       işaretli toplamı (delta) hesap bazında biriktirilir; ters alınmadan ÖNCE.
 *       Sonra her hesabın {@code current_balance}'ından bu delta ÇIKARILIR.
 *       <b>Cerrahi:</b> yalnız LOAN'ın bıraktığı tutar geri alınır — başka
 *       sebeplerle cached↔derived sapması olan hesaplara DOKUNULMAZ (overwrite
 *       YOK, sadece bilinen LOAN etkisi düşülür).</li>
 * </ol>
 *
 * <p><b>İdempotency:</b> 1. adım entry-key bazında ({@code reverse → re-derive})
 * tekrar koşturmaya güvenli (yeni postingler hep aynı, gerçek hesaba LOAN bacağı
 * BIRAKMAZ). 2. adımdaki delta, ters-alınmadan önce ölçülen LOAN tutarıdır;
 * {@code system_flags} bayrağı ile tek-sefer çalışır (delta düşme yalnız bir kez
 * uygulanır — çift düşme olmaz).</p>
 *
 * <p><b>NOT — MAIN_CASH/SUB_CASH:</b> bunlar üye-hesap aggregate'i (posting-
 * türetilmez); 2. adımda DOKUNULMAZ. Alt-kasa bakiyeleri için
 * {@code SubCashBalanceRecomputeRunner}/{@code SubCashInclusionService} LOAN'ı
 * artık zaten dışlar (income helper'ları güncellendi).</p>
 *
 * <p>v2.0.0'da Flyway/Liquibase'e taşınınca silinir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(80) // TransactionPostingBackfill (30) + SystemCashHolderBackfill (45) + tüm migration'lardan SONRA
public class LoanCashExclusionRestoreRunner implements ApplicationRunner {

    private static final String FLAG_KEY = "loan_cash_exclusion_restore_v1";

    private final JdbcTemplate jdbc;
    private final JournalEntryRepository journalEntryRepository;
    private final TransactionRepository transactionRepository;
    private final BankAccountRepository bankAccountRepository;
    private final LedgerPostingService ledgerPostingService;

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("CREATE TABLE IF NOT EXISTS system_flags ("
                    + "key VARCHAR(120) PRIMARY KEY, "
                    + "set_at TIMESTAMP NOT NULL DEFAULT NOW())");
            Integer cnt = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM system_flags WHERE key=?", Integer.class, FLAG_KEY);
            if (cnt != null && cnt > 0) {
                log.debug("[loan-cash-restore] already applied — skip");
                return;
            }
            RestoreResult r = restore();
            jdbc.update("INSERT INTO system_flags(key) VALUES(?) ON CONFLICT DO NOTHING", FLAG_KEY);
            log.info("[loan-cash-restore] applied — LOAN posting yeniden-türetildi: {} tx, "
                    + "kasa snapshot'ından LOAN delta düşülen: {} hesap.",
                    r.rederived(), r.rebalanced());
        } catch (Exception e) {
            // Boot'u DÜŞÜRME — sadece logla (idempotent; flag yazılmadıysa sonraki
            // boot tekrar dener).
            log.error("[loan-cash-restore] FAILED (boot devam ediyor):", e);
        }
    }

    /** Tek transaction: LOAN posting'leri yeniden türet + kasa delta'sını düş. */
    @Transactional
    public RestoreResult restore() {
        // ── 1) LOAN tx'lerini bul, gerçek-hesap LOAN bacaklarının delta'sını
        //       hesap bazında ölç (ters almadan ÖNCE), sonra posting'i yeni
        //       kuralla yeniden türet (account=NULL clearing). Tx KENDİSİ korunur.
        Map<UUID, BigDecimal> loanDeltaByAccount = new HashMap<>();
        List<JournalEntry> entries = journalEntryRepository
                .findBySourceType(JournalSourceType.TRANSFER);
        int rederived = 0;
        for (JournalEntry e : entries) {
            if (e.getSourceRefId() == null) continue;
            Transaction tx = transactionRepository.findById(e.getSourceRefId()).orElse(null);
            if (tx == null || tx.getKind() != TransactionKind.LOAN) continue; // gerçek TRANSFER'e DOKUNMA
            // Eski entry'nin gerçek hesaba (account != NULL) yazdığı LOCATION_MOVE
            // bacaklarını ölç — bu, kasaya bırakılan hayali etkidir.
            for (Posting p : e.getPostings()) {
                if (p.getAccount() == null) continue;            // P&L/clearing bacağı — kasaya değmez
                if (p.getLegKind() != PostingLegKind.LOCATION_MOVE) continue;
                if (p.getAmount() == null) continue;
                loanDeltaByAccount.merge(p.getAccount().getId(), p.getAmount(), BigDecimal::add);
            }
            try {
                ledgerPostingService.reversePostingsForTransaction(tx.getId());
                ledgerPostingService.deriveForTransactionId(tx.getId());
                rederived++;
            } catch (Exception ex) {
                log.warn("[loan-cash-restore] tx={} yeniden-türetme hatası (izole, atlandı): {}",
                        tx.getId(), ex.getMessage());
            }
        }

        // ── 2) Ölçülen LOAN delta'sını her gerçek kasa hesabının
        //       current_balance'ından DÜŞ (cerrahi — yalnız LOAN etkisi geri alınır).
        int rebalanced = 0;
        for (Map.Entry<UUID, BigDecimal> d : loanDeltaByAccount.entrySet()) {
            if (d.getValue().signum() == 0) continue;
            BankAccount acc = bankAccountRepository.findById(d.getKey()).orElse(null);
            if (acc == null) continue;
            // MAIN_CASH/SUB_CASH aggregate (posting-türetilmez) — LOAN bacağı zaten
            // bunlara yazılmazdı; defansif atla.
            if (acc.getType() != null && !acc.getType().isPostingDerivable()) continue;
            BigDecimal cur = acc.getCurrentBalance() != null
                    ? acc.getCurrentBalance() : BigDecimal.ZERO;
            BigDecimal corrected = cur.subtract(d.getValue());
            log.info("[loan-cash-restore] account={} ({}) current_balance {} → {} (LOAN delta {} düşüldü)",
                    acc.getId(), acc.getType() != null ? acc.getType().name() : "?",
                    cur.toPlainString(), corrected.toPlainString(), d.getValue().toPlainString());
            acc.setCurrentBalance(corrected);
            bankAccountRepository.save(acc);
            rebalanced++;
        }
        return new RestoreResult(rederived, rebalanced);
    }

    /** Restorasyon sonucu (log için): yeniden-türetilen tx + delta düşülen hesap. */
    public record RestoreResult(int rederived, int rebalanced) {}
}
