package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "fixed_costs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FixedCost {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /** Sabit gider adi (Kira, Personel Gideri, Elektrik, vb.) */
    @Column(nullable = false)
    private String name;

    /** Sabit gider tipi: RENT, PERSONNEL, UTILITY, OTHER */
    @Column(nullable = false)
    private String type;

    /** Aylik tutar */
    @Column(precision = 15, scale = 2, nullable = false)
    private BigDecimal amount;

    /** Frekans: MONTHLY, YEARLY */
    @Column(nullable = false)
    @Builder.Default
    private String frequency = "MONTHLY";

    /** Otomatik hesaplanan mi? (personel gideri gibi) */
    @Column(name = "is_auto", nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private boolean auto = false;

    /** Not / Aciklama */
    private String notes;

    @Column(name = "is_active", nullable = false, columnDefinition = "boolean default true")
    @Builder.Default
    private boolean active = true;

    /**
     * v1.5.9: recurring engine için "her ay otomatik üret" bayrağı.
     * {@code auto} alanı manuel hesaplanan giderler içindir (örn. personel toplamı);
     * bu yeni alan kullanıcının sadece "her ay tx olarak da yansısın" tercihidir.
     * Default false — geriye uyumluluk: mevcut FixedCost'lar otomatik tx üretmez.
     */
    @Column(name = "auto_generate", nullable = false)
    @org.hibernate.annotations.ColumnDefault("false")
    @Builder.Default
    private boolean autoGenerate = false;

    /**
     * v1.5.9: son otomatik üretim zamanı. RecurringTxGeneratorTask her ayın 1'i
     * çalışınca buraya kaydeder; idempotency için kontrol edilir (aynı YYYY-MM
     * içinde tekrar tetiklenirse atlanır).
     */
    @Column(name = "last_auto_run")
    private LocalDateTime lastAutoRun;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
