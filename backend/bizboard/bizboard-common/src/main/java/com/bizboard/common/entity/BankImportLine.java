package com.bizboard.common.entity;

import com.bizboard.common.enums.BankImportLineStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.8 / §5) — banka ekstre satırı (İSKELET).
 *
 * <p>Bugün manuel/elle girilir: tarih + tutar (işaretli: + giriş, − çıkış) +
 * karşı-taraf metni + kategori. Onaylanınca JournalEntry+Posting üretilir
 * (account bacağı + kategori P&L bacağı). Açıklanamayan satır = FLAGGED.</p>
 */
@Entity
@Table(name = "bank_import_lines", indexes = {
        @Index(name = "idx_bil_batch", columnList = "batch_id"),
        @Index(name = "idx_bil_status", columnList = "status")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BankImportLine {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "batch_id", nullable = false)
    private BankImportBatch batch;

    /** Ham metin (PDF parse'ta dolar; manuel girişte kullanıcı notu/açıklama). */
    @Column(name = "raw_text", columnDefinition = "TEXT")
    private String rawText;

    @Column(name = "parsed_date")
    private LocalDate parsedDate;

    /** İşaretli tutar: + = hesaba giriş, − = hesaptan çıkış. */
    @Column(name = "parsed_amount", precision = 19, scale = 2)
    private BigDecimal parsedAmount;

    /** Karşı-taraf metni (kategori öğrenme/öneri anahtarı). */
    @Column(name = "parsed_counterpart", length = 255)
    private String parsedCounterpart;

    /** Öğrenme kuralından gelen öneri (kullanıcı onaylayana dek confirmed != suggested). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "suggested_category_id")
    private Category suggestedCategory;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "confirmed_category_id")
    private Category confirmedCategory;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private BankImportLineStatus status = BankImportLineStatus.PARSED;

    /** Postala sonucu üretilen entry (reversible için izlenir). */
    @Column(name = "journal_entry_id")
    private UUID journalEntryId;
}
