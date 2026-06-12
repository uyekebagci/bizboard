package com.bizboard.common.entity;

import com.bizboard.common.enums.ApprovalStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Onay (Approval) modülü — JENERİK onay çerçevesi.
 *
 * <p>Hassas/eşik-üstü bir işlem doğrudan yürütülmek yerine bir
 * {@code approval_request} olarak (PENDING) kaydedilir. Yetkili onaylayınca
 * ({@link ApprovalStatus#APPROVED}) işlem yürütülür; reddedince
 * ({@link ApprovalStatus#REJECTED}) hiçbir zaman yürütülmez.</p>
 *
 * <p><b>STRICT multi-tenant:</b> her kayıt bir {@link Business}'a bağlıdır
 * ({@code business_id NOT NULL}); kullanıcı yalnız kendi erişebildiği işletmenin
 * onaylarını görür/yönetir. Onay-akışındaki her geçiş audit'lenir.</p>
 *
 * <h3>{@code actionType}</h3>
 * <p>Onaya tabi işlemin türü — örn. {@code BALANCE_ADJUST}. AOP aspect ya da
 * çağıran servis bu değeri set eder; onaylanınca aynı tür için kayıtlı bir
 * yürütücü ({@code ApprovalExecutor}) çağrılır.</p>
 *
 * <h3>{@code payload} (JSONB)</h3>
 * <p>Onaylanınca işlemin tekrar kurulup yürütülmesi için gereken tüm girdiler.
 * Örn. bakiye düzeltme: {@code {accountId, newBalance, description, actorUserId}}.</p>
 *
 * <h3>verify-code (opsiyonel)</h3>
 * <p>Talep ekstra doğrulama isterse {@code verifyCode} + {@code verifyCodeExpiresAt}
 * set edilir. Onay öncesi {@code POST /approvals/{id}/verify-code} ile doğrulanmalı
 * ({@code verifiedAt} dolar). Doğrulanmamış kod-zorunlu talep onaylanamaz.</p>
 */
@Entity
@Table(name = "approval_requests", indexes = {
        @Index(name = "idx_approval_business_status", columnList = "business_id, status"),
        @Index(name = "idx_approval_action_type", columnList = "action_type"),
        @Index(name = "idx_approval_created", columnList = "created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ApprovalRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** STRICT tenant izolasyonu — onay her zaman bir işletmeye aittir. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /** Talebi açan kullanıcı (denormalized id; audit + UI için). */
    @Column(name = "requested_by")
    private UUID requestedBy;

    /**
     * Onaya tabi işlemin türü — örn. {@code BALANCE_ADJUST}. Onaylanınca bu türe
     * kayıtlı {@code ApprovalExecutor} çağrılır.
     */
    @Column(name = "action_type", nullable = false, length = 64)
    private String actionType;

    /** İnsan-okur kısa özet (liste/detayda gösterim için). */
    @Column(name = "title", length = 512)
    private String title;

    /** Onaylanınca işlemi yürütmek için gereken girdiler (JSONB). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> payload;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private ApprovalStatus status = ApprovalStatus.PENDING;

    /** Onaylayan/reddeden/iptal eden kullanıcı (terminal durumda dolar). */
    @Column(name = "approver")
    private UUID approver;

    /** Onay/red/iptal gerekçesi (red için STRICT zorunlu — servis doğrular). */
    @Column(name = "reason", columnDefinition = "TEXT")
    private String reason;

    // ── verify-code (opsiyonel TTL'li doğrulama) ──────────────────────────────

    /** Opsiyonel doğrulama kodu — set ise onaydan önce doğrulanmalı. */
    @Column(name = "verify_code", length = 16)
    private String verifyCode;

    /** verify-code'un son geçerlilik anı (TTL). */
    @Column(name = "verify_code_expires_at")
    private LocalDateTime verifyCodeExpiresAt;

    /** verify-code doğrulandığı an (null = doğrulanmadı). */
    @Column(name = "verified_at")
    private LocalDateTime verifiedAt;

    // ── lifecycle timestamps ──────────────────────────────────────────────────

    /** Tüm talebin (onay-akışının) genel TTL'i — geçince EXPIRED. Null = süresiz. */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    /** Terminal duruma (approve/reject/cancel/expire) geçiş anı. */
    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    /** Convenience — kayıt hâlâ onay bekliyor mu? (status==PENDING ve TTL geçmemiş) */
    @Transient
    public boolean isPending() {
        if (status != ApprovalStatus.PENDING) return false;
        return expiresAt == null || expiresAt.isAfter(LocalDateTime.now());
    }

    /** Convenience — kod-zorunlu talep henüz doğrulanmamış mı? */
    @Transient
    public boolean isVerifyPending() {
        return verifyCode != null && verifiedAt == null;
    }
}
