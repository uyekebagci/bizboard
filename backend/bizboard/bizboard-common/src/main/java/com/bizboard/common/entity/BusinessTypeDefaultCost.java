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
 * v1.5.6: bir {@link BusinessType} için varsayılan maliyet şablonu.
 *
 * <p>Yeni işletme oluşturulurken kullanıcı "Kurulum maliyetlerini ekle"
 * checkbox'ını seçerse bu kayıtlar şu şekilde yansır:</p>
 * <ul>
 *   <li>{@code isSetup=true} → tek seferlik {@link Transaction} olarak oluşturulur
 *       (kurulum tarihinde, {@code isSetupCost=true} flag'li, business açılış gideri).</li>
 *   <li>{@code isSetup=false} → tekrarlayan {@link FixedCost} olarak oluşturulur
 *       (her ay devam eden sabit gider; v1.6 recurring engine bunu üretir).</li>
 * </ul>
 *
 * <p>Master data — admin yönetir. Mevcut işletmeler bu kayıt değişikliklerinden
 * geriye dönük etkilenmez (sadece yeni create akışında uygulanır).</p>
 */
@Entity
@Table(name = "business_type_default_costs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BusinessTypeDefaultCost {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_type_id", nullable = false)
    private BusinessType businessType;

    /** Görünür ad: "Kira depozitosu", "Tabela", "Telefon hattı", vb. */
    @Column(nullable = false)
    private String name;

    /** Kategori: RENT, PERSONNEL, UTILITY, SUPPLIES, MARKETING, LEGAL, OTHER. */
    @Column(nullable = false)
    @Builder.Default
    private String category = "OTHER";

    /** Tahmini tutar (kullanıcı override edebilir; bilgi amaçlı). */
    @Column(nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal amount = BigDecimal.ZERO;

    @Builder.Default
    private String currency = "TRY";

    /**
     * true → tek seferlik kurulum gideri (Transaction olarak yansır).
     * false → tekrarlayan sabit gider (FixedCost olarak yansır).
     */
    @Column(name = "is_setup", nullable = false)
    @ColumnDefault("false")
    @Builder.Default
    private boolean setup = false;

    /** Tekrarlayan ise frequency: MONTHLY / YEARLY / QUARTERLY. Setup için ignore. */
    @Column(nullable = false)
    @Builder.Default
    private String frequency = "MONTHLY";

    /** UI sıralama. */
    @Column(name = "sort_order", nullable = false)
    @ColumnDefault("0")
    @Builder.Default
    private int sortOrder = 0;

    /** Açıklama / not (admin için detay; UI'da göstermek opsiyonel). */
    @Column(columnDefinition = "text")
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
