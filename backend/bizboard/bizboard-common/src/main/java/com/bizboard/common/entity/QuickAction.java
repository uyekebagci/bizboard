package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * WP e4dc5271 (Beta v1.4): Kullanıcı kendi tx'lerinden şablon kaydedebilir.
 *
 * <p>User-level scope: her user her business için max 12 şablon. tx_template
 * JSONB — execute zamanı override + entity ref validation. Limit service-layer
 * enforced; DB constraint sadece (user, business, name) unique.</p>
 *
 * <p>tx_template örnek:
 * {@code {direction:"income", kind:"NORMAL", amount:300000, payment_method:"POS",
 * pos_device_id:"...", bank_account_id:"...", counterpart_id:"...",
 * applied_pos_rate:3.29, applied_our_commission_rate:5.0}}</p>
 */
@Entity
@Table(name = "quick_actions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class QuickAction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Column(nullable = false, length = 100)
    private String name;

    /** Tx template — JSONB. Execute zamanı bu üzerine override merge edilir. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "tx_template", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> txTemplate = Map.of();

    @Column(length = 50)
    private String icon;

    @Column(length = 20)
    private String color;

    @Column(name = "order_index", nullable = false)
    @Builder.Default
    private int orderIndex = 0;

    @Column(name = "usage_count", nullable = false)
    @Builder.Default
    private int usageCount = 0;

    @Column(name = "last_used_at")
    private LocalDateTime lastUsedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
