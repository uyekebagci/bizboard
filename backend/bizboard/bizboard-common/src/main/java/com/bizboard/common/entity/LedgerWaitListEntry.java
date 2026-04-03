package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Geriye dönük işlem değişikliklerinin bekleme listesi.
 *
 * Bir transaction eklenir/silinir ve kapanmış bir döneme (geçmiş aya) aitse,
 * bu tabloya bir kayıt düşer. LedgerService her sabah 03:30'da bu listeyi tarar
 * ve closed_period_summaries tablosunu günceller.
 *
 * action: "ADD" → yeni işlem eklendi, "DELETE" → işlem silindi
 */
@Entity
@Table(name = "ledger_wait_list")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LedgerWaitListEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "business_id", nullable = false)
    private UUID businessId;

    @Column(name = "target_year", nullable = false)
    private int targetYear;

    @Column(name = "target_month", nullable = false)
    private int targetMonth;

    /**
     * ADD → geriye dönük yeni işlem eklendi
     * DELETE → geçmiş bir dönemdeki işlem silindi
     */
    @Column(nullable = false, length = 10)
    private String action;

    @Column(name = "transaction_id")
    private UUID transactionId;

    @Column(name = "processed", nullable = false)
    @Builder.Default
    private boolean processed = false;

    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
