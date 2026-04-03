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

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
