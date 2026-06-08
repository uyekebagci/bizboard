package com.bizboard.common.entity;

import com.bizboard.common.enums.DebtDirection;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Borç/Alacak kayıtları.
 * direction = RECEIVABLE → bana borcu var (alacak)
 * direction = PAYABLE    → benim borcum var (verecek)
 */
@Entity
@Table(name = "debts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Debt {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /** RECEIVABLE (alacak) veya PAYABLE (verecek) */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DebtDirection direction;

    /**
     * Karşı tarafın adı (free-text). v1.5.0 öncesi tek bilgi kaynağıydı;
     * şimdi yeni borçlar {@link #counterpartRef} (Counterpart entity) ile
     * normalize ediliyor. Geriye uyumluluk için bu string zorunlu kalır —
     * counterpart_id varsa onun {@code name}'i buraya yazılır.
     */
    @Column(name = "counterparty", nullable = false)
    private String counterparty;

    /**
     * v1.5.0: yeni borçlar bir {@link Counterpart} kaydına bağlanır;
     * cari hesap motoru bu üzerinden balance hesaplar. Eski kayıtlarda
     * null olabilir (migration utility v1.5.x'te bağlayacak).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "counterpart_id")
    private Counterpart counterpartRef;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    /**
     * v1.7.x WP fbb2ef55: ödeme yapıldıktan sonra kalan tutar.
     * remaining_amount = amount − Σ(debt_payments for this debt).
     * 0 ise PAID, amount'tan küçükse PARTIAL.
     *
     * <p>JPA tarafında nullable=true bırakıldı — Hibernate auto-DDL prod'da
     * mevcut row'lara NOT NULL ekleyemediği için. Runtime'da SchemaMigrationRunner
     * backfill + NOT NULL apply ediyor; bu nedenle servis kodu null beklemez
     * (defansif: getRemainingAmount() null'sa amount fallback'i yapılıyor).</p>
     */
    @Column(name = "remaining_amount", precision = 15, scale = 2)
    private BigDecimal remainingAmount;

    /**
     * v1.7.x: OPEN | PARTIAL | PAID | CANCELLED.
     * Eski is_settled boolean'a paralel; PAID = is_settled.
     */
    @Column(name = "status", length = 10)
    @Builder.Default
    private String status = "OPEN";

    @Column(length = 10)
    @Builder.Default
    private String currency = "TRY";

    /**
     * WP a9da4e9d (USD+Altın): Orijinal para birimindeki tutar (kaynak gerçeği).
     * TRY borçlarda = amount. USD/GOLD borçlarda kullanıcının girdiği döviz/gram
     * tutarı. magnitude POZİTİF. {@code amount}/{@code remaining_amount} TL
     * cinsindendir (recompute güncel kurla yeniler); bu alan orijinal kalır.
     */
    @Column(name = "original_amount", precision = 19, scale = 4)
    private BigDecimal originalAmount;

    /**
     * WP a9da4e9d: Son recompute/kayıt anındaki kur (1 birim original currency =
     * rateSnapshot TL). TRY → 1. Referans/gösterim; canlı TL recompute'tan gelir.
     */
    @Column(name = "rate_snapshot", precision = 19, scale = 6)
    private BigDecimal rateSnapshot;

    /** WP a9da4e9d: rateSnapshot'ın alındığı an (gösterim). */
    @Column(name = "rate_snapshot_at")
    private LocalDateTime rateSnapshotAt;

    /** Borç tipi: CEK, SENET, NAKIT veya özel */
    @Column(name = "instrument_type", nullable = false)
    private String instrumentType;

    /**
     * v1.6.5: alacak (RECEIVABLE) tipinde borçlar için tip seçimi.
     * İzin verilen değerler (uygulama enum'u): SENET, CEK, ALTIN, NAKIT, DIGER.
     * PAYABLE borçlar için null kalır. RECEIVABLE için önerilen, ama zorunlu değil.
     * "DIGER" seçilirse {@link #receivableTypeOther} doldurulmalı.
     */
    @Column(name = "receivable_type", length = 32)
    private String receivableType;

    /** v1.6.5: receivable_type = DIGER iken serbest metin tip adı (max 120). */
    @Column(name = "receivable_type_other", length = 120)
    private String receivableTypeOther;

    /**
     * v1.6.18 (WP-1): Çek vadesi (receivable_type=CEK için anlamlı).
     * dueDate ile karıştırılmamalı — çek özelinde tahsil tarihidir.
     */
    @Column(name = "cheque_due_date")
    private LocalDate chequeDueDate;

    /** v1.6.18 (WP-1): Çeki tahsile veren banka adı. */
    @Column(name = "cheque_collector_bank", length = 120)
    private String chequeCollectorBank;

    /** v1.6.18 (WP-1): Çek seri numarası. */
    @Column(name = "cheque_no", length = 64)
    private String chequeNo;

    /**
     * v1.6.18 (WP-1): Hatırlatma tarihi. Cron her sabah 09:00
     * reminder_date == today olan borç kayıtları için bildirim gönderir.
     */
    @Column(name = "reminder_date")
    private LocalDate reminderDate;

    /** v1.6.18 (WP-1): Hatırlatma notu (kullanıcı serbest metni). */
    @Column(name = "reminder_note", columnDefinition = "TEXT")
    private String reminderNote;

    /** Vade tarihi */
    @Column(name = "due_date")
    private LocalDate dueDate;

    /** Tahsil edildi / ödendi mi */
    @Column(name = "is_settled")
    @Builder.Default
    private boolean settled = false;

    /** Tahsilat / ödeme tarihi */
    @Column(name = "settled_at")
    private LocalDateTime settledAt;

    @Column(columnDefinition = "TEXT")
    private String description;

    /** Belge/fotoğraf URL'i */
    @Column(name = "document_url")
    private String documentUrl;

    /** Sadece admin görebilir */
    @Column(name = "admin_only")
    @Builder.Default
    private boolean adminOnly = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
