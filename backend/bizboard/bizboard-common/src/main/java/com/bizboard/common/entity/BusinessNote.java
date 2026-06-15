package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "business_notes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BusinessNote {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    /**
     * WP a9da4e9d fix: Not kapsamı. "BUSINESS" = işletme detay sayfası notları
     * (varsayılan, geriye uyumlu — mevcut tüm notlar bu kümede), "RECEIVABLES" =
     * Alacaklar sayfasına özel notlar, "FIRMALARIM" = Firmalarım sayfasına özel
     * notlar. Tüm kümeler tamamen ayrı listelenir.
     *
     * <p>Bu kolonda DB seviyesinde CHECK constraint YOKTUR — düz varchar(20).
     * Geçerli scope kümesi yalnız uygulama katmanında
     * ({@code BusinessNoteService.normalizeScope}) zorlanır. Bu yüzden yeni bir
     * scope değeri eklemek (ör. FIRMALARIM) DDL/CHECK migration gerektirmez.</p>
     *
     * <p>{@code columnDefinition} ile NOT NULL DEFAULT 'BUSINESS' — Hibernate
     * ddl-auto=update kolonu eklerken mevcut satırları DEFAULT ile BUSINESS'a
     * doldurur. {@code BusinessNoteScopeBackfill} ayrıca idempotent garanti verir.</p>
     */
    @Column(name = "scope", nullable = false, length = 20,
            columnDefinition = "varchar(20) default 'BUSINESS'")
    @Builder.Default
    private String scope = "BUSINESS";

    /** Sabitlenmiş not */
    @Column(name = "is_pinned")
    @Builder.Default
    private boolean pinned = false;

    /** Not rengi (opsiyonel, UI'da renkli kartlar için) */
    private String color;

    /** Sadece admin görebilir */
    @Column(name = "admin_only")
    @Builder.Default
    private boolean adminOnly = false;

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
