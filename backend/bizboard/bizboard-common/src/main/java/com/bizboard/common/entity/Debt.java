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

    @Column(length = 10)
    @Builder.Default
    private String currency = "TRY";

    /** Borç tipi: CEK, SENET, NAKIT veya özel */
    @Column(name = "instrument_type", nullable = false)
    private String instrumentType;

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
