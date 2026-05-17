package com.bizboard.common.entity;

import com.bizboard.common.enums.TransactionDirection;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "transactions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Transaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TransactionDirection direction;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Builder.Default
    private String currency = "TRY";

    private String description;

    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "receipt_url")
    private String receiptUrl;

    /**
     * v1.5.6: tek seferlik kurulum maliyeti (business açılış gideri) bayrağı.
     * Yeni işletme wizard'ında "Kurulum maliyetlerini ekle" seçilirse otomatik
     * oluşturulan Transaction'lar bu flag ile işaretlenir. Raporlama tarafı
     * bu sayede setup'ı rutin operasyonel giderden ayırabilir.
     */
    @Column(name = "is_setup_cost", nullable = false)
    @org.hibernate.annotations.ColumnDefault("false")
    @Builder.Default
    private boolean setupCost = false;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private List<String> tags = List.of();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> metadata = Map.of();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
