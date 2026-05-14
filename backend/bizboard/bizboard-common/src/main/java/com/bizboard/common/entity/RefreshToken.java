package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Long-lived refresh token. Only the SHA-256 hash is stored — the plaintext
 * lives in the user's HttpOnly cookie. On every refresh we ROTATE: the
 * presented token is marked revoked and a fresh one is issued. The
 * {@code replacedById} chain lets us detect reuse of a rotated token
 * (a signal of token theft) in a future patch.
 *
 * <p>Cleanup of expired rows is a future cron job — until then they
 * accumulate; benign because lookups go through an index.</p>
 */
@Entity
@Table(name = "refresh_tokens", indexes = {
        @Index(name = "idx_rt_user", columnList = "user_id"),
        @Index(name = "idx_rt_hash", columnList = "token_hash", unique = true),
        @Index(name = "idx_rt_expires", columnList = "expires_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Hangi kullanıcıya ait. */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /**
     * SHA-256 hash'i. Plaintext sadece kullanıcının HttpOnly cookie'sinde —
     * DB sızıntısı olsa bile token'lar kullanılabilir hale gelmez.
     */
    @Column(name = "token_hash", nullable = false, length = 64, unique = true)
    private String tokenHash;

    /** Token expire tarihi. */
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /** Manuel veya rotation sonucu revoke edildi mi? */
    @Column(nullable = false)
    @Builder.Default
    private boolean revoked = false;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    /**
     * Bu token rotation ile değiştirildiyse yerine geçen token'ın ID'si.
     * Sökülmüş zincirde aynı eski token tekrar görülürse "theft" sinyali —
     * v1.x patch'inde tüm zincir revoke edilecek.
     */
    @Column(name = "replaced_by_id")
    private UUID replacedById;

    /** Audit: hangi tarayıcı/cihazdan oluşturulduğu. */
    @Column(name = "user_agent", length = 512)
    private String userAgent;

    /** Audit: hangi IP'den (X-Forwarded-For aware). */
    @Column(name = "ip_address", length = 64)
    private String ipAddress;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false, nullable = false)
    private LocalDateTime createdAt;
}
