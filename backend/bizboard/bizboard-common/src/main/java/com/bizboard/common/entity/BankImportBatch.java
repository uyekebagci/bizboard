package com.bizboard.common.entity;

import com.bizboard.common.enums.BankImportBatchStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.8 / §5) — banka ekstre import partisi (İSKELET).
 *
 * <p><b>KARAR A4:</b> mutabakat çekirdeği PDF'e BAĞLI OLMADAN çalışır. Bu parti
 * bugün <b>manuel/elle satır girişi</b> için kullanılır (UI'dan banka hesabı
 * seç → satır ekle → kategorile → postala). PDF auto-parser ERTELENDİ; örnek
 * dosyalar gelince ayrı alt-iş olarak {@code fileUrl} + parser eklenir.</p>
 */
@Entity
@Table(name = "bank_import_batches", indexes = {
        @Index(name = "idx_bib_business_account", columnList = "business_id, account_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BankImportBatch {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /** Bu partinin ait olduğu banka hesabı (satırlar bu hesabın bacağını üretir). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private BankAccount account;

    /** Ekstre tarihi / gün. */
    @Column(name = "statement_date")
    private LocalDate statementDate;

    /** PDF/dosya URL'i — ERTELENDİ; bugün manuel girişte null. */
    @Column(name = "file_url", length = 512)
    private String fileUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private BankImportBatchStatus status = BankImportBatchStatus.OPEN;

    @Column(name = "line_count", nullable = false)
    @Builder.Default
    private int lineCount = 0;

    @Column(name = "matched_count", nullable = false)
    @Builder.Default
    private int matchedCount = 0;

    @Column(name = "unexplained_count", nullable = false)
    @Builder.Default
    private int unexplainedCount = 0;

    @Column(name = "created_by")
    private UUID createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "batch", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<BankImportLine> lines = new ArrayList<>();
}
