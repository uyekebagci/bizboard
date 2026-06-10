package com.bizboard.common.entity;

import com.bizboard.common.enums.PostingLegKind;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Ledger v2 (Faz A) — çift-giriş bacağı (leg). Bir {@link JournalEntry}'ye
 * bağlı, işaretli ({@code signed}) bir tutar taşır.
 *
 * <p><b>İşaret konvansiyonu:</b> {@code amount} bir hesabın bakiyesine olan
 * NET etkisidir. Pozitif = hesaba giriş (bakiye artar), negatif = çıkış
 * (bakiye azalır). Bir hesabın bakiyesi = Σ o hesaba ait posting.amount.</p>
 *
 * <p>Çekirdek invariant: aynı {@code JournalEntry}'deki posting'lerin
 * {@code amount} toplamı = 0 (dengeli entry).</p>
 *
 * <p>{@code leg_kind} bacağın raporlama niteliğini belirler (konum hareketi vs
 * P&L gelir/gider/masraf). {@code category_id} P&L kırılımı için (NE tür);
 * {@code counterpart_id} cari (alacak/borç) bacakları için. İkisi de opsiyonel.</p>
 */
@Entity
@Table(name = "postings", indexes = {
        @Index(name = "idx_posting_entry", columnList = "journal_entry_id"),
        @Index(name = "idx_posting_account", columnList = "account_id"),
        @Index(name = "idx_posting_category", columnList = "category_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Posting {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "journal_entry_id", nullable = false)
    private JournalEntry journalEntry;

    /**
     * Bu bacağın etkilediği hesap. {@code Account} = mevcut {@code bank_accounts}
     * genişlemesi (CHECKING/SAVINGS/MAIN_CASH/SUB_CASH/CASH_HOLDER + Faz A'da
     * eklenen POS_SETTLEMENT/RECEIVABLE/PAYABLE/ASSET).
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private BankAccount account;

    /**
     * Bakiyeye işaretli net etki. Pozitif = giriş, negatif = çıkış.
     * 19,2 precision — {@code bank_accounts.current_balance} ile aynı ölçek.
     */
    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "leg_kind", nullable = false, length = 16)
    private PostingLegKind legKind;

    /**
     * P&L kategori kırılımı (NE tür gelir/gider). Yön-bağımsız, paylaşımlı
     * Category'ye işaret eder. {@code LOCATION_MOVE} bacaklarında genelde NULL.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    /**
     * Cari taraf (alacak/borç) — RECEIVABLE/PAYABLE bacaklarında doldurulur.
     * Diğer bacaklarda NULL.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "counterpart_id")
    private Counterpart counterpart;
}
