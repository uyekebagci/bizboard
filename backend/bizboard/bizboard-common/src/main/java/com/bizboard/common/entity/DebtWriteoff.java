package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * WP a9da4e9d (Beta v1.1 · Borçlar Modülü): borçtan ödeme almadan manuel
 * düşürülen tutar (af, iskonto, mutabakat sonrası düzeltme, hatalı kayıt).
 *
 * <p>debt_payments tablosundan AYRI. Writeoff bir ödeme değil — bank_account,
 * payment_method, instrument YOK. Muhasebe netliği için iki kavram ayrı
 * tablolarda tutulur.</p>
 *
 * <p>Etki sınırı: yalnız debt.remaining_amount'ı düşürür ve cari hesap
 * statement'ına yansır. Transaction, KONSOLİDE NET, Closure, sub-cash income
 * gibi hiçbir tx tabanlı raporu etkilemez.</p>
 */
@Entity
@Table(name = "debt_writeoffs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DebtWriteoff {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "counterpart_id", nullable = false)
    private Counterpart counterpart;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "debt_id", nullable = false)
    private Debt debt;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(columnDefinition = "TEXT")
    private String reason;

    @Column(name = "written_off_by", nullable = false)
    private UUID writtenOffBy;

    @CreationTimestamp
    @Column(name = "written_off_at", updatable = false)
    private LocalDateTime writtenOffAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
