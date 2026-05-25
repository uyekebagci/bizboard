package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.7.x WP 8b961444 TODO ba04debb: Per-firm user access kaydı.
 *
 * <p>UNIQUE(my_company_id, user_id) — idempotent grant. ADMIN her zaman
 * tüm firmaları görür (bu tablo filter etmez).</p>
 */
@Entity
@Table(name = "my_company_user_access")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MyCompanyUserAccess {

    @Id
    @UuidGenerator
    @Column(columnDefinition = "uuid")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "my_company_id", nullable = false)
    private MyCompany myCompany;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "granted_at", nullable = false, updatable = false)
    private LocalDateTime grantedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "granted_by")
    private User grantedBy;

    @PrePersist
    void onCreate() {
        if (grantedAt == null) grantedAt = LocalDateTime.now();
    }
}
