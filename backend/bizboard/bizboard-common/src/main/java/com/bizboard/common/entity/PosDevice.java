package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.18 (WP-1): POS cihazı entity.
 *
 * <p>Excel'deki "POS cihazı" kavramı — bir firma adına (firmamızın veya
 * tedarikçinin) bağlı, banka entegrasyonlu, belirli bir komisyon oranı taşıyan
 * fiziksel cihaz. Tx girilirken POS seçildiğinde bu cihaz seçilir ve cihazın
 * o anki oranı tx'e snapshot edilir ({@code Transaction.appliedPosRate}).</p>
 *
 * <p>Cihazın {@code defaultRate}'i sonra değişirse eski tx'lerin oranı sabit
 * kalır (snapshot). {@code lastUsedRate} en son kullanılan oranı tutar —
 * UI'da varsayılan değer olarak gösterilir.</p>
 */
@Entity
@Table(name = "pos_devices")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PosDevice {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /**
     * v1.6.23.20 (Security WP 667d8a71 / arch-rules §1.1): multi-tenant izolasyon
     * için zorunlu. Önceki sürümlerde yoktu — POS device DGR-only varsayımıyla
     * unutulmuştu. Tüm mevcut satırlar DGR'ye backfill edildi.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Column(nullable = false, length = 120)
    private String name;

    /**
     * POS cihazının sahibi olan firma (tüzel kişi). Genelde DGR'nin kendi cihazı
     * veya bir tedarikçi cihazı. PERSON kayıtları sahip olamaz.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_counterpart_id")
    private Counterpart ownerCounterpart;

    /** Banka adı — basit string (banka entity'si daha sonra eklenebilir). */
    @Column(name = "bank_name", length = 120)
    private String bankName;

    /** Default komisyon oranı (yüzde) — yeni tx girilirken pre-fill. */
    @Column(name = "default_rate", precision = 5, scale = 2)
    private BigDecimal defaultRate;

    /** En son kullanılan oran — UI'da pre-fill için ipucu (defaultRate'ten önce). */
    @Column(name = "last_used_rate", precision = 5, scale = 2)
    private BigDecimal lastUsedRate;

    /**
     * v1.7.x (POS Komisyon WP TODO 1bb4529a): Cihazın "bizim oran" defaultu —
     * yeni POS tx girilirken pre-fill. {@code defaultRate} semantik olarak
     * BANKA oranı; bu alan DGR'nin müşteriden aldığı oran.
     *
     * <p>Validation: {@code our_commission_rate >= default_rate} (banka oranı).</p>
     */
    @Column(name = "our_commission_rate", precision = 5, scale = 2)
    private BigDecimal ourCommissionRate;

    @Column(name = "is_active", nullable = false)
    @ColumnDefault("true")
    @Builder.Default
    private boolean active = true;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
