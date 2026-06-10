package com.bizboard.common.entity;

import com.bizboard.common.enums.JournalSourceType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz A) — çift-giriş çekirdeği: bir muhasebe olayının başlığı.
 *
 * <p>Her {@code JournalEntry} bir kaynak olaydan (intent) türetilir
 * ({@code source_type} + {@code source_ref_id}) ve {@link Posting} bacaklarını
 * gruplar. Çekirdek invariant: bir entry'nin tüm posting'lerinin
 * {@code amount} toplamı sıfırdır (dengeli çift-giriş).</p>
 *
 * <p><b>Intent korunur:</b> {@code Transaction} (kullanıcı niyeti) yıkıcı
 * değişmeden kalır; her tx için bu entry + posting'leri TÜRETİLİR
 * ({@code source_type=MANUAL_TX}, {@code source_ref_id=transaction.id}).
 * Bakiye/rapor/mutabakat posting'ten okunur — Transaction yan-etki cached
 * snapshot'ı geriye-uyum facade'i olarak korunur.</p>
 *
 * <p><b>Reversal:</b> idempotent runner / düzeltme akışı bir entry'i ters
 * çevirirken yeni bir entry yaratır ve {@code reversed_of_id} ile orijinale
 * bağlar (fiziksel silme yok — audit izi korunur).</p>
 *
 * <p>v2.0.0'da Flyway/Liquibase'e taşınınca {@code ddl-auto=update} bağımlılığı
 * kalkar; şema additive olduğundan mevcut tablolar etkilenmez.</p>
 */
@Entity
@Table(name = "journal_entries", indexes = {
        @Index(name = "idx_journal_business_date", columnList = "business_id, entry_date"),
        @Index(name = "idx_journal_source", columnList = "source_type, source_ref_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JournalEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /** Muhasebe (efektif) tarihi — Transaction.date'ten türetilir. */
    @Column(name = "entry_date", nullable = false)
    private LocalDate entryDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false, length = 24)
    private JournalSourceType sourceType;

    /**
     * Kaynak olayın id'si — {@code MANUAL_TX} için {@code transactions.id}.
     * Nullable: bazı kaynak tipleri (örn. DAY_CLOSE_ADJUST ileride) ref tutmaz.
     */
    @Column(name = "source_ref_id")
    private UUID sourceRefId;

    @Column(length = 500)
    private String description;

    /**
     * Bu entry başka bir entry'nin tersi (reversal) ise orijinalin id'si.
     * NULL = normal entry. Reversal idempotent runner / düzeltme akışında set
     * edilir; fiziksel silme yerine ters bacaklarla nötrlenir.
     */
    @Column(name = "reversed_of_id")
    private UUID reversedOfId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    /**
     * Bu entry'nin posting bacakları. Cascade ALL + orphanRemoval: entry
     * silinince/temizlenince bacakları da gider (reversible runner için).
     */
    @OneToMany(mappedBy = "journalEntry", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<Posting> postings = new ArrayList<>();
}
