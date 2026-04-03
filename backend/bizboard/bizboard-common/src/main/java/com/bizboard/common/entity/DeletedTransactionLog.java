package com.bizboard.common.entity;

import com.bizboard.common.enums.TransactionDirection;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Silinen işlemlerin kalıcı kaydı.
 * Her silinen transaction buraya tam bilgileriyle arşivlenir.
 * Silme sebebi (reason) zorunludur.
 */
@Entity
@Table(name = "deleted_transaction_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DeletedTransactionLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Silinen transaction'ın orijinal ID'si */
    @Column(name = "original_transaction_id", nullable = false)
    private UUID originalTransactionId;

    @Column(name = "business_id", nullable = false)
    private UUID businessId;

    @Column(name = "business_name")
    private String businessName;

    @Column(name = "category_id")
    private UUID categoryId;

    @Column(name = "category_name")
    private String categoryName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TransactionDirection direction;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    private String currency;

    /** İşlemin orijinal açıklaması */
    @Column(name = "original_description")
    private String originalDescription;

    /** İşlemin tarihi */
    @Column(name = "transaction_date", nullable = false)
    private LocalDate transactionDate;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private List<String> tags = List.of();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> metadata = Map.of();

    /** Silme sebebi — ZORUNLU */
    @Column(name = "deletion_reason", nullable = false)
    private String deletionReason;

    /** Silme işlemini yapan kullanıcı */
    @Column(name = "deleted_by", nullable = false)
    private UUID deletedBy;

    @Column(name = "deleted_by_name")
    private String deletedByName;

    @CreationTimestamp
    @Column(name = "deleted_at", updatable = false)
    private LocalDateTime deletedAt;
}
