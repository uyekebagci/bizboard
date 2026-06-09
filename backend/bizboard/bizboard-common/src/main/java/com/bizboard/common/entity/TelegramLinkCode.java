package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Telegram bot MVP: tek-kullanımlık deep-link bağlama kodu.
 *
 * <p>Kullanıcı dashboard'dan "Bağla" deyince kod üretilir (~10dk TTL); Telegram'da
 * {@code /start <code>} ile bota gider. Webhook kodu çözer → chat_id'yi
 * NotificationChannelBinding'e yazar (verified=true) ve kodu tüketir.</p>
 *
 * <p>Kod plaintext değil — kısa, tahmin-edilemez (secure random base32) ve
 * tek-kullanımlık ({@code consumedAt} dolunca geçersiz). Multi-instance güvenli
 * olsun diye DB'de tutulur (Redis yok).</p>
 */
@Entity
@Table(name = "telegram_link_codes",
        indexes = @Index(name = "idx_tg_link_code", columnList = "code", unique = true))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TelegramLinkCode {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Tek-kullanımlık kod (deep-link payload'ı). Unique. */
    @Column(name = "code", nullable = false, length = 32, unique = true)
    private String code;

    /** Kodu üreten kullanıcı — başarılı /start sonrası binding bu user'a yazılır. */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** TTL — bu andan sonra kod geçersiz. */
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /** Tüketildi mi (tek-kullanımlık). Null = henüz kullanılmadı. */
    @Column(name = "consumed_at")
    private LocalDateTime consumedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
