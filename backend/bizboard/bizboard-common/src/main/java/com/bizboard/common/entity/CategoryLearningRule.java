package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.8) — karşı-taraf → kategori öğrenme kuralı.
 *
 * <p>Banka satırı kategorilenince {@code (counterpartPattern → category)}
 * eşlemesi öğrenilir; aynı karşı-taraf bir daha gelince {@code hitCount} artar
 * ve öneri olarak sunulur. Pattern = normalize edilmiş karşı-taraf metni
 * (lowercase, trim). Tenant-scoped + pattern unique.</p>
 */
@Entity
@Table(name = "category_learning_rules", uniqueConstraints = {
        @UniqueConstraint(name = "uk_clr_business_pattern",
                columnNames = {"business_id", "counterpart_pattern"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CategoryLearningRule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /** Normalize edilmiş karşı-taraf metni (lowercase + trim). */
    @Column(name = "counterpart_pattern", nullable = false, length = 255)
    private String counterpartPattern;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    @Column(name = "hit_count", nullable = false)
    @Builder.Default
    private int hitCount = 1;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
