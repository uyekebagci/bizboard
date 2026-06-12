package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Lightweight audit trail for security-sensitive actions.
 *
 * <p>Currently records file downloads ({@code FILE_DOWNLOAD}) and is designed to be
 * extended for {@code FILE_DELETE}, {@code USER_LOGIN}, {@code USER_PERMISSION_CHANGE}, etc.
 * The {@code metadata} JSON column is intentionally schemaless so new actions don't
 * require a migration.</p>
 */
@Entity
@Table(name = "audit_logs", indexes = {
        @Index(name = "idx_audit_user_time", columnList = "user_id, created_at"),
        @Index(name = "idx_audit_action_time", columnList = "action, created_at"),
        @Index(name = "idx_audit_resource", columnList = "resource_type, resource_id"),
        // Tamper-proof hash-chain: sıralı doğrulama + zincir ucu (max seq) sorgusu için.
        @Index(name = "idx_audit_chain_seq", columnList = "chain_seq")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Who performed the action. Nullable for system / anonymous events. */
    @Column(name = "user_id")
    private UUID userId;

    /** Denormalised username for forensic readability when the user row is later deleted. */
    @Column(name = "user_name", length = 255)
    private String userName;

    /** What happened. Free-form string; suggested constants live in {@link com.bizboard.common.audit.AuditAction}. */
    @Column(nullable = false, length = 64)
    private String action;

    /** Type of resource acted upon (e.g. {@code FILE}, {@code BUSINESS}). */
    @Column(name = "resource_type", length = 64)
    private String resourceType;

    /** ID of resource acted upon. */
    @Column(name = "resource_id")
    private UUID resourceId;

    /** IP address from which the action originated (best-effort, X-Forwarded-For aware). */
    @Column(name = "ip_address", length = 64)
    private String ipAddress;

    /** User-Agent string at the time of the action. */
    @Column(name = "user_agent", length = 512)
    private String userAgent;

    /** Optional free-form context (e.g. file name, business name, error reason). */
    @Column(length = 1024)
    private String detail;

    /**
     * v1.6.18 (WP-1): Audit kaydının görsel vurgu tipi. UI rozet/renk için.
     * Değerler: BACKDATED / CORRECTION / CLOSING_REOPEN / POS_RATE_OVERRIDE / null.
     */
    @Column(name = "highlight_type", length = 32)
    private String highlightType;

    /** Schemaless extra metadata for future use without migrations. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    /**
     * Oluşturulma zamanı.
     *
     * <p><b>mod-audit:</b> Önceden {@code @CreationTimestamp} ile insert anında
     * Hibernate üretiyordu. Hash-chain için {@code createdAt} kanonik hash
     * girdisinde yer aldığından, değer hash hesabından ÖNCE sabitlenmiş olmalı;
     * aksi halde insert'te değer değişir ve doğrulama yanlış FAIL verir.
     * {@code @PrePersist} guard'ı yalnız null ise atar → önceden set edilmiş
     * (hash'lenmiş) değer KORUNUR. Davranış geriye-uyumlu: değer set edilmezse
     * eskisi gibi insert anında now() atanır.</p>
     */
    @Column(name = "created_at", updatable = false, nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void ensureCreatedAt() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    // ── Tamper-proof hash-chain (mod-audit, v1.1) ────────────────────────────
    // Additive ve nullable: mevcut audit yazımını BOZMAZ. Geçmiş kayıtlar
    // backfill ile zincirlenir; null kalan kayıtlar "henüz zincirlenmemiş"
    // sayılır ve doğrulamada raporlanır.

    /**
     * Bu kayıttan bir önceki kaydın {@code recordHash}'i. Zincirin ilk kaydı
     * için {@link com.bizboard.common.audit.AuditHashUtil#GENESIS_PREV_HASH}.
     * Geçmiş bir kaydı değiştirmek, ondan sonraki kayıtların hash'lerini
     * geçersiz kılar → tahrifat zincir doğrulamasında yakalanır.
     */
    @Column(name = "prev_hash", length = 64)
    private String prevHash;

    /**
     * Bu kaydın kanonik içeriğinin (prev_hash dahil) SHA-256 özeti. 64 hex.
     * @see com.bizboard.common.audit.AuditHashUtil#computeRecordHash
     */
    @Column(name = "record_hash", length = 64)
    private String recordHash;

    /**
     * Zincirdeki monoton-artan sıra numarası (1'den başlar). Doğrulamayı
     * deterministik kılar (aynı milisaniyede yazılan kayıtların sırası
     * created_at ile belirsiz olabilir). Backfill ve canlı yazım aynı
     * sayacı kullanır.
     */
    @Column(name = "chain_seq")
    private Long chainSeq;

    /**
     * KVKK retention anonimleştirme işareti. true ise PII alanları
     * ({@code userName/ip/userAgent/detail}) maskelenmiştir. İdempotensi sağlar
     * (aynı kayıt iki kez anonimleştirilmez) ve aday sorgusunu kesinleştirir.
     * Default false (Hibernate {@code ddl-auto=update} ile null gelebilir →
     * okuma tarafı null'ı false sayar).
     */
    @Column(name = "anonymized")
    private Boolean anonymized;
}
