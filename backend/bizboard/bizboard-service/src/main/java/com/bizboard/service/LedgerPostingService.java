package com.bizboard.service;

import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.JournalEntry;
import com.bizboard.common.entity.Posting;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.JournalSourceType;
import com.bizboard.common.enums.PostingLegKind;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.JournalEntryRepository;
import com.bizboard.repository.TransactionRepository;
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
 * Ledger v2 (Faz A) — Transaction (intent) → çift-giriş Posting türetme çekirdeği.
 *
 * <p><b>Karar (§2, §8):</b> {@code Transaction} YIKILMAZ; her tx için DENGELİ bir
 * {@link JournalEntry} + {@link Posting} bacakları TÜRETİLİR. Bakiye/rapor
 * posting'ten okunur; Transaction yan-etki cached snapshot geriye-uyum facade'i
 * olarak korunur (kırılmaz).</p>
 *
 * <h3>Türetme kuralları (§8.3):</h3>
 * <ul>
 *   <li><b>NAKIT / HESAPDAN</b>: konum bacağı (resolved {@code bankAccount}) =
 *       işaretli delta (gelir +, gider −, {@code LOCATION_MOVE}); karşı P&L bacağı
 *       (account NULL) = ters işaret, {@code PNL_INCOME}/{@code PNL_EXPENSE},
 *       kategori taşır.</li>
 *   <li><b>POS</b> (unsettled): brüt POS havuzu ({@code POS_SETTLEMENT}) bacağı +
 *       P&L bacağı. Havuz hesabı yoksa (Faz A'da henüz açılmamış olabilir) tx
 *       {@code bankAccount}'ına düşer; konum yine de izlenir. Komisyon
 *       {@code PNL_COST} ayrımı settle anında (Faz C) eklenir.</li>
 *   <li><b>TRANSFER</b> (kind=TRANSFER): iki {@code LOCATION_MOVE} bacağı
 *       (çıkış hesabı −, giriş hesabı +); P&L'i ETKİLEMEZ.</li>
 * </ul>
 *
 * <p><b>İnvariant:</b> üretilen her entry için Σ posting.amount = 0. Dengelenemeyen
 * tx (örn. hesabı çözülememiş) FLAGGED olarak loglanır, entry üretilmez —
 * yetim/yarım posting bırakılmaz (STRICT).</p>
 *
 * <p><b>İdempotent:</b> {@code source_type=MANUAL_TX/TRANSFER + source_ref_id=tx.id}
 * anahtarıyla; entry zaten varsa tekrar üretmez. <b>Reversible:</b>
 * {@link #reversePostingsForTransaction} entry+bacaklarını siler (cascade).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LedgerPostingService {

    private final JournalEntryRepository journalEntryRepository;
    private final TransactionRepository transactionRepository;
    private final BankAccountRepository bankAccountRepository;

    /**
     * Bir transaction id için dengeli JournalEntry+Posting türetir (idempotent).
     * Tx'i KENDİ transaction'ı içinde taze yükler — lazy association'lar
     * (business/category/counterpart/bankAccount) güvenle okunur (detached
     * entity / {@code LazyInitializationException} riski yok). Backfill runner
     * bunu çağırır.
     *
     * @return üretilen entry; zaten varsa mevcut entry; türetilemezse (FLAGGED
     *         veya tx yok) {@link Optional#empty()}.
     */
    @Transactional
    public Optional<JournalEntry> deriveForTransactionId(UUID txId) {
        if (txId == null) return Optional.empty();
        Transaction tx = transactionRepository.findById(txId).orElse(null);
        if (tx == null) return Optional.empty();
        return deriveForTransaction(tx);
    }

    /**
     * Bir transaction için dengeli JournalEntry+Posting türetir (idempotent).
     * Çağıran AKTİF bir JPA session içinde olmalı (lazy fetch için);
     * detached entity ile çağırmak yerine {@link #deriveForTransactionId} tercih
     * edilir.
     *
     * @return üretilen entry; zaten varsa mevcut entry; türetilemezse (FLAGGED)
     *         {@link Optional#empty()}.
     */
    @Transactional
    public Optional<JournalEntry> deriveForTransaction(Transaction tx) {
        if (tx == null || tx.getId() == null || tx.getBusiness() == null) {
            return Optional.empty();
        }
        // LOAN (verilen/alınan borç) ve TRANSFER aynı kategoride: bilanço
        // hareketi (P&L'e girmez). İdempotency + reversal için TRANSFER source
        // type'ı paylaşırlar (reversePostingsForTransaction ikisini de tarar).
        JournalSourceType sourceType = (isTransfer(tx) || isLoan(tx))
                ? JournalSourceType.TRANSFER : JournalSourceType.MANUAL_TX;

        // İdempotency: bu tx için entry zaten varsa tekrar üretme.
        Optional<JournalEntry> existing =
                journalEntryRepository.findBySourceTypeAndSourceRefId(sourceType, tx.getId());
        if (existing.isPresent()) {
            return existing;
        }

        List<PostingDraft> legs = buildLegs(tx);
        if (legs.isEmpty()) {
            log.warn("[ledger-posting] tx={} FLAGGED — bacak turetilemedi (hesap/kombinasyon cozulemedi); "
                    + "entry uretilmedi.", tx.getId());
            return Optional.empty();
        }

        BigDecimal sum = legs.stream()
                .map(l -> l.amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (sum.compareTo(BigDecimal.ZERO) != 0) {
            log.warn("[ledger-posting] tx={} FLAGGED — bacaklar dengesiz (Σ={}); entry uretilmedi.",
                    tx.getId(), sum.toPlainString());
            return Optional.empty();
        }

        JournalEntry entry = JournalEntry.builder()
                .business(tx.getBusiness())
                .entryDate(tx.getDate())
                .sourceType(sourceType)
                .sourceRefId(tx.getId())
                .description(buildDescription(tx))
                .createdBy(tx.getCreatedBy())
                .build();

        List<Posting> postings = new ArrayList<>();
        for (PostingDraft d : legs) {
            postings.add(Posting.builder()
                    .journalEntry(entry)
                    .account(d.account)
                    .amount(d.amount)
                    .legKind(d.legKind)
                    .category(d.withCategory ? tx.getCategory() : null)
                    .counterpart(d.withCounterpart ? tx.getTargetCounterpart() : null)
                    .build());
        }
        entry.setPostings(postings);

        entry = journalEntryRepository.save(entry); // cascade postings
        return Optional.of(entry);
    }

    /**
     * Bir transaction'a türetilmiş entry+posting'leri SİLER (reversible runner /
     * tx silme akışı için). İdempotent — yoksa no-op.
     *
     * @return silinen entry sayısı (0 veya 1).
     */
    @Transactional
    public int reversePostingsForTransaction(java.util.UUID txId) {
        if (txId == null) return 0;
        int removed = 0;
        for (JournalSourceType st : new JournalSourceType[]{
                JournalSourceType.MANUAL_TX, JournalSourceType.TRANSFER}) {
            Optional<JournalEntry> e = journalEntryRepository.findBySourceTypeAndSourceRefId(st, txId);
            if (e.isPresent()) {
                journalEntryRepository.delete(e.get()); // cascade + orphanRemoval bacakları siler
                removed++;
            }
        }
        return removed;
    }

    /**
     * Dry-run: tx için bacakları türetir ama PERSIST ETMEZ. Backfill öncesi
     * "kaç tx dengeli/FLAGGED olur" analizi için. Reversible/güvenli — DB'ye
     * dokunmaz.
     *
     * @return dengeli bacak üretilebiliyorsa {@code true}; aksi halde
     *         {@code false} (FLAGGED adayı).
     */
    @Transactional(readOnly = true)
    public boolean wouldDeriveBalanced(Transaction tx) {
        if (tx == null || tx.getId() == null || tx.getBusiness() == null) {
            return false;
        }
        List<PostingDraft> legs = buildLegs(tx);
        if (legs.isEmpty()) return false;
        BigDecimal sum = legs.stream().map(l -> l.amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return sum.compareTo(BigDecimal.ZERO) == 0;
    }

    // ───────── türetme mantığı ─────────

    private boolean isTransfer(Transaction tx) {
        return tx.getKind() == com.bizboard.common.enums.TransactionKind.TRANSFER;
    }

    private boolean isLoan(Transaction tx) {
        return tx.getKind() == com.bizboard.common.enums.TransactionKind.LOAN;
    }

    /**
     * Tx'in payment_method / direction / kind kombinasyonundan dengeli bacak
     * taslakları üretir. Çözülemeyen kombinasyon → boş liste (FLAGGED).
     */
    private List<PostingDraft> buildLegs(Transaction tx) {
        List<PostingDraft> legs = new ArrayList<>();
        BigDecimal amount = tx.getAmount();
        if (amount == null || amount.signum() == 0) {
            return legs; // sıfır/null tutar — anlamlı bacak yok
        }
        boolean income = tx.getDirection() == TransactionDirection.INCOME;
        BankAccount loc = resolveLocationAccount(tx);

        if (isLoan(tx)) {
            // LOAN (Verilen/Alınan Borç): kasa ↔ cari (alacak/verecek) arası
            // TRANSFER. Verilen borç → nakit ÇIKAR (direction=EXPENSE, kasa −);
            // alınan borç → nakit ARTAR (direction=INCOME, kasa +). Karşı bacak
            // bir cari (alacak/verecek) hareketidir → KONUM bacağı (LOCATION_MOVE),
            // account NULL (cari bakiyesi Debt entity'sinden okunur; posting çift
            // sayım yapmasın diye RECEIVABLE/PAYABLE hesabı AÇMIYORUZ). P&L bacağı
            // YOK → Net Kâr'a girmez. Σ=0 dengeli. Karşı bacak counterpart taşır
            // (iz/drill-down). Bakiye yalnız gerçek kasa hesabına (loc) yansır.
            if (loc == null) return legs;
            BigDecimal signedLoc = income ? amount : amount.negate();
            legs.add(PostingDraft.location(loc, signedLoc));
            legs.add(PostingDraft.clearingWithCounterpart(signedLoc.negate()));
            return legs;
        }

        if (isTransfer(tx)) {
            // TRANSFER bacağı: tek bir tx tek yönü temsil eder (OUT veya IN).
            // Çift-giriş dengesi için aynı entry'de karşı bacak gerekir; ancak
            // mevcut model her transfer yönünü AYRI tx olarak tutar (transferPairId).
            // Bu yüzden her transfer tx için DENGELİ tek-entry türetmek üzere:
            // konum bacağı (±amount) + karşı LOCATION_MOVE clearing bacağı (account
            // NULL, ters işaret). Bakiye yalnız gerçek hesaba (loc) yansır; karşı
            // bacak entry'i dengeler (transfer P&L'i etkilemez).
            if (loc == null) return legs;
            BigDecimal signed = income ? amount : amount.negate();
            legs.add(PostingDraft.location(loc, signed));
            legs.add(PostingDraft.clearing(signed.negate(), PostingLegKind.LOCATION_MOVE));
            return legs;
        }

        // NORMAL tx (NAKIT / HESAPDAN / POS).
        if (loc == null) {
            return legs; // konum hesabı çözülemedi → FLAGGED
        }
        BigDecimal signedLoc = income ? amount : amount.negate();
        legs.add(PostingDraft.location(loc, signedLoc));
        // Karşı P&L bacağı (account NULL): gelir → PNL_INCOME (-);
        // gider → PNL_EXPENSE (+) ya da masraf → PNL_COST (+) (gider≠masraf, Faz C §5).
        PostingLegKind pnlKind = income
                ? PostingLegKind.PNL_INCOME
                : (isCostCategory(tx.getCategory()) ? PostingLegKind.PNL_COST : PostingLegKind.PNL_EXPENSE);
        legs.add(PostingDraft.pnl(signedLoc.negate(), pnlKind, true, true));
        return legs;
    }

    /**
     * Ledger v2 (Faz C, §5 — gider≠masraf): bir gider işleminin MASRAF mı (banka
     * komisyonu/transfer ücreti = {@code PNL_COST}) yoksa GİDER mi (kira/maaş =
     * {@code PNL_EXPENSE}) olduğunu kategori adından çıkarır. Config-benzeri
     * (kategori adı) — rakam/sabit hard-code değil; kullanıcı kategori adıyla
     * kontrol eder. Eşleşme yoksa GİDER (geriye-uyum: mevcut davranış korunur).
     */
    private boolean isCostCategory(com.bizboard.common.entity.Category category) {
        if (category == null || category.getName() == null) return false;
        String n = category.getName().toLowerCase(java.util.Locale.ROOT);
        return n.contains("komisyon")
                || n.contains("transfer ücret") || n.contains("transfer ucret")
                || n.contains("havale ücret") || n.contains("havale ucret")
                || n.contains("eft ücret") || n.contains("eft ucret")
                || n.contains("banka masraf") || n.contains("masraf");
    }

    /**
     * Bir NORMAL tx'in konum hesabını çözer.
     *
     * <p>NAKIT/HESAPDAN/POS yeni tx'ler create anında bir {@code bankAccount}'a
     * route edilir; ancak ESKİ NAKIT kayıtlarında {@code bank_account_id} NULL
     * olabilir (routing sonradan eklendi). Bu durumda
     * {@link TransactionMutationService} ile AYNI fallback uygulanır: business'in
     * sistem "Genel Nakit" ({@code is_system=true}, {@code CASH_HOLDER}) hesabına
     * route edilir — böylece eski NAKIT tx'ler de dengeli posting türetir
     * (kapsam kaybı yok).</p>
     *
     * <p>POS unsettled + bankAccount NULL durumunda Faz A'da gerçek konum
     * çözülemez → {@code null} döner (FLAGGED). Faz C'de POS_SETTLEMENT havuzu
     * eklenince çözülür.</p>
     */
    private BankAccount resolveLocationAccount(Transaction tx) {
        if (tx.getBankAccount() != null) {
            return tx.getBankAccount();
        }
        String pm = tx.getPaymentMethod() != null ? tx.getPaymentMethod() : "NAKIT";
        // NAKIT fallback: business sistem "Genel Nakit" CASH_HOLDER.
        // BUG-2 (POS bank_account): bankAccount belirtilmemiş POS GELİR tx'i de
        // (eski FE bank_account_id göndermiyordu → bankAccount NULL → FLAGGED →
        // posting yok → gün-kapanışı/mutabakata girmez) aynı sistem "Genel Nakit"
        // CASH_HOLDER fallback'ine route edilir. Böylece create akışı düzeltilmeden
        // ÖNCE oluşmuş FLAGGED POS gelirleri admin/boot backfill ile kurtarılabilir.
        // (POS GİDER kendi pos_tx_subtype akışını kullanır — burada hariç.)
        boolean nakit = "NAKIT".equals(pm);
        boolean posIncome = "POS".equals(pm)
                && tx.getDirection() == TransactionDirection.INCOME;
        if ((nakit || posIncome) && tx.getBusiness() != null) {
            return bankAccountRepository
                    .findByActiveTrueAndBusinessIdInOrderByNameAsc(
                            List.of(tx.getBusiness().getId()))
                    .stream()
                    .filter(ba -> ba.isSystem() && ba.getType() == BankAccountType.CASH_HOLDER)
                    .findFirst()
                    .orElse(null);
        }
        return null;
    }

    private String buildDescription(Transaction tx) {
        StringBuilder sb = new StringBuilder();
        sb.append(tx.getDirection() != null ? tx.getDirection().name() : "?");
        if (tx.getPaymentMethod() != null) sb.append(' ').append(tx.getPaymentMethod());
        if (tx.getCategory() != null && tx.getCategory().getName() != null) {
            sb.append(" — ").append(tx.getCategory().getName());
        }
        String s = sb.toString();
        return s.length() > 500 ? s.substring(0, 500) : s;
    }

    /** Bacak taslağı (entity yaratmadan önce dengeyi doğrulamak için). */
    private static final class PostingDraft {
        final BankAccount account;       // NULL = P&L / clearing bacağı
        final BigDecimal amount;         // işaretli
        final PostingLegKind legKind;
        final boolean withCategory;
        final boolean withCounterpart;

        private PostingDraft(BankAccount account, BigDecimal amount, PostingLegKind legKind,
                             boolean withCategory, boolean withCounterpart) {
            this.account = account;
            this.amount = amount;
            this.legKind = legKind;
            this.withCategory = withCategory;
            this.withCounterpart = withCounterpart;
        }

        static PostingDraft location(BankAccount account, BigDecimal amount) {
            return new PostingDraft(account, amount, PostingLegKind.LOCATION_MOVE, false, false);
        }

        static PostingDraft pnl(BigDecimal amount, PostingLegKind kind,
                                boolean withCategory, boolean withCounterpart) {
            return new PostingDraft(null, amount, kind, withCategory, withCounterpart);
        }

        static PostingDraft clearing(BigDecimal amount, PostingLegKind kind) {
            return new PostingDraft(null, amount, kind, false, false);
        }

        /**
         * LOAN karşı bacağı: cari (alacak/verecek) konum hareketi. account NULL
         * (RECEIVABLE/PAYABLE hesabı açılmaz; cari bakiye Debt'ten okunur →
         * çift sayım yok), {@code LOCATION_MOVE} (P&L'e girmez), counterpart taşır.
         */
        static PostingDraft clearingWithCounterpart(BigDecimal amount) {
            return new PostingDraft(null, amount, PostingLegKind.LOCATION_MOVE, false, true);
        }
    }
}
