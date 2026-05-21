package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.23.12 (WP 3c8401f6): Telefon markası master kaydı.
 *
 * <p>Source-of-truth: {@code classpath:/data/phones-master.json}. Startup'ta
 * {@code PhoneMasterDataLoader} JSON'dan diff hesabıyla upsert eder. Manuel
 * INSERT/UPDATE yapılmamalı — JSON edit + redeploy / admin reload tetik yolu.</p>
 */
@Entity
@Table(name = "phone_brand", uniqueConstraints = {
        @UniqueConstraint(name = "uk_phone_brand_name", columnNames = "name")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PhoneBrand {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 48)
    private String name;

    @Column(length = 64)
    private String slug;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 100;

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
