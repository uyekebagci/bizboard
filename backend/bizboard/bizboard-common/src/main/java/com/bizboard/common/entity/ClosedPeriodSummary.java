package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "closed_period_summaries",
        uniqueConstraints = @UniqueConstraint(columnNames = {"business_id", "year", "month"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClosedPeriodSummary {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Column(nullable = false)
    private int year;

    @Column(nullable = false)
    private int month;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    @Column(name = "total_income", precision = 15, scale = 2, nullable = false)
    @Builder.Default
    private BigDecimal totalIncome = BigDecimal.ZERO;

    @Column(name = "total_expense", precision = 15, scale = 2, nullable = false)
    @Builder.Default
    private BigDecimal totalExpense = BigDecimal.ZERO;

    @Column(name = "net_profit", precision = 15, scale = 2, nullable = false)
    @Builder.Default
    private BigDecimal netProfit = BigDecimal.ZERO;

    @Column(name = "transaction_count", nullable = false)
    @Builder.Default
    private int transactionCount = 0;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "breakdown_by_category", columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Map<String, BigDecimal>> breakdownByCategory = Map.of();

    @Column(name = "closed_at", nullable = false)
    private LocalDateTime closedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
