package com.bizboard.common.entity;

import com.bizboard.common.enums.CategoryApplicability;
import com.bizboard.common.enums.TransactionDirection;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "categories")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Category {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Column(nullable = false)
    private String name;

    /**
     * Paylaşımlı kategori modeli (yön-bağımsız): bir kategori hem gelir hem
     * gider işlemlerinde kullanılabilir. NULL = paylaşımlı (yeni model).
     *
     * <p>Eski yön-bazlı kayıtlar migration ile NULL'a (paylaşımlı) çevrilir;
     * sütun nullable kalır (geriye dönük veri okunabilir).</p>
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = true)
    private TransactionDirection direction;

    /**
     * Ledger v2 (Faz A, RAFİNASYON 1 — §3.9): hibrit uygulanabilirlik.
     * {@code direction} (eski yön kolonu) yerini bu alana bırakır — bir kategori
     * BOTH (varsayılan, paylaşımlı) / INCOME_ONLY / EXPENSE_ONLY olabilir.
     *
     * <p>Migration tüm mevcut kategorileri {@code BOTH}'a düşürür (KIRILMA YOK);
     * eski {@code direction} değeri sadece öneri olarak loglanır (otomatik kilit
     * YOK, STRICT). İşlem formu o anki yöne göre süzer; ihlal = uyarı (hard-block
     * değil, A7 kararı).</p>
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @ColumnDefault("'BOTH'")
    @Builder.Default
    private CategoryApplicability applicability = CategoryApplicability.BOTH;

    private String icon;

    private String color;

    @Column(name = "sort_order")
    @Builder.Default
    private int sortOrder = 0;

    @Column(name = "is_active")
    @Builder.Default
    private boolean active = true;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
