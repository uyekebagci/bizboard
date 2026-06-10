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
 * v2.2.0 — kullanıcının kaydedilmiş araması (spec §9.1 /search/saved, §10.4).
 *
 * <p><b>Tenant izolasyonu (T1):</b> her kayıt {@code user_id}'ye bağlıdır; kullanıcı
 * yalnız kendi kayıtlı aramalarını görür/yönetir. İçerik salt query string + UI
 * filtre snapshot'ı olduğundan ek erişim kontrolü gerektirmez (sorgu çalıştığında
 * sonuçlar yine access-filter'dan geçer).</p>
 */
@Entity
@Table(name = "saved_searches", indexes = {
        @Index(name = "idx_saved_search_user", columnList = "user_id, created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SavedSearch {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Sahip kullanıcı — izolasyon anahtarı. */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 120)
    private String name;

    /** Ham arama sorgusu (örn. {@code kira tutar:>5000 tarih:son-ay}). */
    @Column(name = "query", nullable = false, length = 512)
    private String query;

    /** UI facet/sort snapshot'ı (schemaless JSON) — opsiyonel. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "filters", columnDefinition = "jsonb")
    private Map<String, Object> filters;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
