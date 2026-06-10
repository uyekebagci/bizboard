package com.bizboard.common.entity;

import com.bizboard.common.enums.DayCloseEditStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §4.2) — finalize olmuş (CLOSED) gün-kapanışını DÜZENLEME
 * isteği. Onaylı akış: admin öneri açar (PENDING) → yetkili onaylar
 * (APPROVED→APPLIED) ya da reddeder (REJECTED). Düzenleme DOĞRUDAN uygulanmaz.
 *
 * <p><b>STRICT:</b> zorunlu gerekçe ({@code reasonCategory}/{@code reasonNote})
 * + tam audit + {@code beforeSnapshot} (rollback için eski değerler). Onay
 * kanalı pluggable — bugün in-app, ileride Faz-2 Telegram (§4.2).</p>
 *
 * <p>{@code payload} önerilen yeni değerleri taşır (JSONB):
 * {@code actualTotal}, {@code accountCounts} ([{accountId, countedBalance}]),
 * {@code reasonCategory}, {@code reasonNote}. {@code beforeSnapshot} eski
 * DayClose + count durumunu taşır.</p>
 */
@Entity
@Table(name = "day_close_edit_requests", indexes = {
        @Index(name = "idx_dcer_dayclose", columnList = "day_close_id"),
        @Index(name = "idx_dcer_status", columnList = "status")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DayCloseEditRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "day_close_id", nullable = false)
    private DayClose dayClose;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private DayCloseEditStatus status = DayCloseEditStatus.PENDING;

    /** Önerilen yeni değerler (actualTotal, accountCounts, reason*). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> payload;

    /** Eski değerler (audit + rollback). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "before_snapshot", columnDefinition = "jsonb")
    private Map<String, Object> beforeSnapshot;

    /** ZORUNLU gerekçe: LOSS/MIS_ENTRY/ROUNDING/OTHER. */
    @Column(name = "reason_category", length = 32)
    private String reasonCategory;

    @Column(name = "reason_note", columnDefinition = "TEXT")
    private String reasonNote;

    @Column(name = "requested_by")
    private UUID requestedBy;

    @CreationTimestamp
    @Column(name = "requested_at", updatable = false)
    private LocalDateTime requestedAt;

    @Column(name = "approved_by")
    private UUID approvedBy;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "applied_at")
    private LocalDateTime appliedAt;

    @Column(name = "reject_note", columnDefinition = "TEXT")
    private String rejectNote;
}
