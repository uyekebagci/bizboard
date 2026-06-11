package com.bizboard.common.entity;

import com.bizboard.common.enums.DayOpenCreatedVia;
import com.bizboard.common.enums.DayOpenStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B — Gün Açılışı) — gün AÇILIŞ omurgası (işletme + tarih başına,
 * UNIQUE). {@link DayClose} (gün kapanışı / SAĞLAMA HESAP) ile simetrik:
 * {@code DayClose} günün SONUNU (sayım + variance), {@code DayOpen} günün
 * BAŞINI (her para-hesabın açılış bakiyesi + devir yuvarlama) modeller.
 *
 * <h3>Akış (KAPSAM §1-2):</h3>
 * <ol>
 *   <li>Her para-hesabın açılışı önceki günün CLOSED actual'ından OTOMATİK dolar
 *       (Faz B devir — {@code DayCloseCalculator.openingFor}).</li>
 *   <li>Kullanıcı her hesabın açılışını elle düzeltir/yuvarlar (DEVİR YUVARLAMA);
 *       her hesap için {@link DayOpenAccountOpening} tutulur (carriedOver / rounded
 *       / roundingDelta).</li>
 *   <li>Fark (Σ rounded − Σ carriedOver) → audited "Devir Yuvarlama" düzeltme
 *       posting'i ({@code JournalSourceType.DAY_CLOSE_ADJUST}, source_ref_id=DayOpen.id).
 *       Σ=0 invariant; bakiye tutarlı; P&L-temiz (LOCATION_MOVE bacaklar).</li>
 *   <li>Onay → gün AÇIK ({@link DayOpenStatus#OPEN}) + audit. İşlem girişi
 *       enforcement açıkken yalnız AÇIK günde serbest.</li>
 *   <li>DayClose finalize → DayOpen durumu {@link DayOpenStatus#CLOSED}.</li>
 * </ol>
 *
 * <p><b>STRICT:</b> açılış/yuvarlama admin-gate + her adım audit; yuvarlama posting
 * Σ=0; mevcut veri (DGR / canlı giriş) bozulmaz (NON-BREAKING — enforcement
 * feature-flag arkasında).</p>
 *
 * <p>{@code ddl-auto=update} ile additive — mevcut tablolar etkilenmez.</p>
 */
@Entity
@Table(name = "day_opens", uniqueConstraints = {
        @UniqueConstraint(name = "uk_day_opens_business_date",
                columnNames = {"business_id", "open_date"})
}, indexes = {
        @Index(name = "idx_day_open_business_date", columnList = "business_id, open_date")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DayOpen {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Column(name = "open_date", nullable = false)
    private LocalDate openDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private DayOpenStatus status = DayOpenStatus.OPEN;

    /**
     * Σ carriedOver — önceki gün CLOSED actual'ından OTOMATİK gelen toplam devir
     * (yuvarlamadan ÖNCE). Audit/şeffaflık için saklanır.
     */
    @Column(name = "carried_over_total", nullable = false, precision = 19, scale = 2)
    @Builder.Default
    private BigDecimal carriedOverTotal = BigDecimal.ZERO;

    /**
     * Σ rounded — kullanıcının elle düzelttiği (yuvarladığı) açılış toplamı. Gün
     * AÇILDIKTAN sonra bu, o günün gerçek opening'idir (computed zinciri buradan
     * devam eder). {@code DayCloseCalculator.openingFor} bunu tercih eder.
     */
    @Column(name = "rounded_total", nullable = false, precision = 19, scale = 2)
    @Builder.Default
    private BigDecimal roundedTotal = BigDecimal.ZERO;

    /**
     * roundedTotal − carriedOverTotal — toplam devir-yuvarlama farkı (delta).
     * Bu fark için Σ=0 "Devir Yuvarlama" posting'i üretilir; pozitif = açılış
     * yukarı yuvarlandı (para eklendi), negatif = aşağı.
     */
    @Column(name = "rounding_delta", nullable = false, precision = 19, scale = 2)
    @Builder.Default
    private BigDecimal roundingDelta = BigDecimal.ZERO;

    /**
     * Devir-yuvarlama düzeltme posting'inin (JournalEntry) id'si. NULL = delta 0
     * (posting üretilmedi). Reversible: DayOpen iptal/yeniden açılışta bu entry
     * geri alınır (kaynak: {@code DAY_CLOSE_ADJUST + source_ref_id=DayOpen.id}).
     */
    @Column(name = "rounding_entry_id")
    private UUID roundingEntryId;

    @Column(name = "reason_note", columnDefinition = "TEXT")
    private String reasonNote;

    /** Bugünden farklı (geçmiş) tarihe açılan açılış mı? (admin + flag). */
    @Column(name = "is_backdated", nullable = false)
    @Builder.Default
    private boolean backdated = false;

    @Enumerated(EnumType.STRING)
    @Column(name = "created_via", nullable = false, length = 20)
    @Builder.Default
    private DayOpenCreatedVia createdVia = DayOpenCreatedVia.MANUAL;

    @Column(name = "opened_by")
    private UUID openedBy;

    @Column(name = "opened_at")
    private LocalDateTime openedAt;

    /** DayClose finalize ile CLOSED'a geçtiği an. */
    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /**
     * Her para-hesabın açılış bacağı (carriedOver / rounded / delta). Cascade ALL
     * + orphanRemoval: yeniden açılışta eski açılışlar temizlenir.
     */
    @OneToMany(mappedBy = "dayOpen", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<DayOpenAccountOpening> accountOpenings = new ArrayList<>();
}
