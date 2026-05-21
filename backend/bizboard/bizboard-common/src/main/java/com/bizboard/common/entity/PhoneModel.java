package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.23.12 (WP 3c8401f6): Telefon modeli master kaydı.
 *
 * <p>Source-of-truth: {@code classpath:/data/phones-master.json}.
 * {@code UNIQUE(brand_id, name)} — aynı marka altında aynı isimde model olmaz.</p>
 */
@Entity
@Table(name = "phone_model",
       uniqueConstraints = @UniqueConstraint(name = "uk_phone_model_brand_name",
                                              columnNames = {"brand_id", "name"}),
       indexes = {
               @Index(name = "idx_phone_model_brand", columnList = "brand_id"),
               @Index(name = "idx_phone_model_name", columnList = "name")
       })
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PhoneModel {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "brand_id", nullable = false)
    private PhoneBrand brand;

    @Column(nullable = false, length = 96)
    private String name;

    @Column(name = "release_year")
    private Integer releaseYear;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
