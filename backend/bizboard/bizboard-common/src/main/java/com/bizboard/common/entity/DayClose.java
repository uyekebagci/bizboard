package com.bizboard.common.entity;

import com.bizboard.common.enums.DayCloseCreatedVia;
import com.bizboard.common.enums.DayCloseStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.6 + §4) — çok-hesaplı gün-kapanışı / mutabakat omurgası.
 *
 * <p>Mevcut {@link CashClosing} (tek-kasa, {@code difference = actual − computed})
 * KORUNUR; {@code DayClose} onun ÜSTÜNE gelen, Excel "SAĞLAMA HESAP" bloğunu
 * birebir modelleyen yeni omurgadır. Her takvim günü için bir kayıt
 * (UNIQUE business + close_date).</p>
 *
 * <h3>SAĞLAMA HESAP zinciri (Excel konvansiyonu — §1.2 / KARAR A1):</h3>
 * <pre>
 *   ÖNCEKİ KASA       = openingBalance   (önceki gün CLOSED actual'ı, otomatik devir)
 *   TOPLAM GELEN      = totalIn          (gün içi posting gelir/giriş)
 *   TOPLAM GİDEN      = totalOut         (gün içi posting gider/çıkış)
 *   OLMASI GEREKEN    = computedClosing  = opening − totalOut + totalIn   (COMPUTED)
 *   SON KASA          = actualTotal      = Σ DayCloseAccountCount.counted  (ACTUAL/sayım)
 *   ARTI EKSİ KALAN   = variance         = computedClosing − actualTotal   (= EKSİK OLAN/kaçak)
 * </pre>
 *
 * <p><b>İşaret konvansiyonu (KARAR A1):</b> {@code variance = computed − actual}.
 * Pozitif = beklenenden AZ para var → EKSİK (kayıp/kaçak). Negatif = fazla.
 * (Mevcut {@code CashClosing.difference = actual − computed} ile TERS; migration
 * işaret dönüşümünü audit'ler — §8.5.)</p>
 */
@Entity
@Table(name = "day_closes", uniqueConstraints = {
        @UniqueConstraint(name = "uk_day_closes_business_date",
                columnNames = {"business_id", "close_date"})
}, indexes = {
        @Index(name = "idx_day_close_business_date", columnList = "business_id, close_date")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DayClose {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Column(name = "close_date", nullable = false)
    private LocalDate closeDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private DayCloseStatus status = DayCloseStatus.PENDING;

    /** ÖNCEKİ KASA — önceki gün CLOSED actual'ı (otomatik devir; §4 madde 6). */
    @Column(name = "opening_balance", nullable = false, precision = 19, scale = 2)
    @Builder.Default
    private BigDecimal openingBalance = BigDecimal.ZERO;

    /** TOPLAM GELEN — gün içi posting gelir/giriş toplamı. */
    @Column(name = "total_in", nullable = false, precision = 19, scale = 2)
    @Builder.Default
    private BigDecimal totalIn = BigDecimal.ZERO;

    /** TOPLAM GİDEN — gün içi posting gider/çıkış toplamı. */
    @Column(name = "total_out", nullable = false, precision = 19, scale = 2)
    @Builder.Default
    private BigDecimal totalOut = BigDecimal.ZERO;

    /** OLMASI GEREKEN KASA = opening − totalOut + totalIn (COMPUTED). */
    @Column(name = "computed_closing", nullable = false, precision = 19, scale = 2)
    @Builder.Default
    private BigDecimal computedClosing = BigDecimal.ZERO;

    /**
     * SON KASA = Σ {@link DayCloseAccountCount}.countedBalance (ACTUAL/sayım).
     * PENDING iken null (henüz sayım girilmedi); CLOSED'da doldurulmuş olmalı.
     */
    @Column(name = "actual_total", precision = 19, scale = 2)
    private BigDecimal actualTotal;

    /**
     * ARTI EKSİ KALAN = computedClosing − actualTotal (EKSİK OLAN/kaçak).
     * Pozitif = eksik para (kayıp); negatif = fazla. PENDING iken null.
     */
    @Column(precision = 19, scale = 2)
    private BigDecimal variance;

    /** Kaçak eşiği (mutlak tutar). variance.abs() bunu aşarsa alarm. */
    @Column(name = "variance_threshold", precision = 19, scale = 2)
    private BigDecimal varianceThreshold;

    /** Eşik aşıldı mı? (alarm tetiklendi). */
    @Column(name = "alarm_fired", nullable = false)
    @Builder.Default
    private boolean alarmFired = false;

    /** Fark sebebi (CLOSED iken, variance != 0 ise önerilir): LOSS/MIS_ENTRY/ROUNDING/OTHER. */
    @Column(name = "reason_category", length = 32)
    private String reasonCategory;

    @Column(name = "reason_note", columnDefinition = "TEXT")
    private String reasonNote;

    /** §4.1: bugünden farklı (geçmiş) tarihe açılan kapanış mı? */
    @Column(name = "is_backdated", nullable = false)
    @Builder.Default
    private boolean backdated = false;

    @Enumerated(EnumType.STRING)
    @Column(name = "created_via", nullable = false, length = 20)
    @Builder.Default
    private DayCloseCreatedVia createdVia = DayCloseCreatedVia.TODAY;

    @Column(name = "closed_by")
    private UUID closedBy;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    /**
     * Her "parası olan hesap" için zorunlu sayım bacakları. Cascade ALL +
     * orphanRemoval: kapanış yeniden sayılınca eski count'lar temizlenir.
     */
    @OneToMany(mappedBy = "dayClose", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<DayCloseAccountCount> accountCounts = new ArrayList<>();

    /** reason_category kanonik değerleri (CashClosing ile aynı). */
    public static final String REASON_LOSS = "LOSS";
    public static final String REASON_MIS_ENTRY = "MIS_ENTRY";
    public static final String REASON_ROUNDING = "ROUNDING";
    public static final String REASON_OTHER = "OTHER";
}
