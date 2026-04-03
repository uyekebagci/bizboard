package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "employees")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Employee {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /** Ad Soyad */
    @Column(name = "full_name", nullable = false)
    private String fullName;

    /** Pozisyon / Gorev */
    private String position;

    /** TC Kimlik No */
    @Column(name = "tc_no")
    private String tcNo;

    /** Telefon */
    private String phone;

    /** Maas (brut) */
    @Column(precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal salary = BigDecimal.ZERO;

    /** SGK / Sigorta bedeli */
    @Column(name = "insurance_cost", precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal insuranceCost = BigDecimal.ZERO;

    /** Ise baslama tarihi */
    @Column(name = "start_date")
    private LocalDate startDate;

    /** Isten ayrilis tarihi (null = hala calisiyor) */
    @Column(name = "end_date")
    private LocalDate endDate;

    /** Aktif mi? */
    @Column(name = "is_active", nullable = false, columnDefinition = "boolean default true")
    @Builder.Default
    private boolean active = true;

    /** Not / Aciklama */
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
