package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Telegram bakiye-düzeltme onay akışı — bir onay talebi için bir Telegram
 * sohbetine gönderilmiş inline-keyboard mesajının izi + tek-kullanımlık callback
 * token'ı.
 *
 * <p>Bir {@link ApprovalRequest} PENDING'e düştüğünde yetkili her admin
 * sohbetine ayrı bir buton-mesajı gider; her mesaj için BURADA bir kayıt açılır
 * (token + chat_id + message_id). Buton callback'i geldiğinde token bu tablodan
 * çözülür → güvenlik (replay/TTL/single-use) ve "ilk-onay-kazanır" mantığı bu
 * kayıtlar üzerinden yürür.</p>
 *
 * <h3>Güvenlik alanları</h3>
 * <ul>
 *   <li><b>{@code token}</b> — tahmin edilemez, benzersiz nonce; callback_data
 *       içinde taşınır. Tek-kullanımlık: {@code consumedAt} dolunca tekrar
 *       kullanılamaz (replay önleme).</li>
 *   <li><b>{@code expiresAt}</b> — buton TTL'i; geçince callback reddedilir.</li>
 * </ul>
 *
 * <p>Bu tablo onay durumunu TUTMAZ — gerçek durum daima {@link ApprovalRequest}
 * üzerindedir (tek-kaynak). Burası yalnız Telegram teslim/etkileşim izidir;
 * yeni paralel onay tablosu DEĞİLDİR.</p>
 */
@Entity
@Table(name = "telegram_approval_callbacks", indexes = {
        @Index(name = "idx_tg_apv_cb_token", columnList = "token", unique = true),
        @Index(name = "idx_tg_apv_cb_approval", columnList = "approval_request_id"),
        @Index(name = "idx_tg_apv_cb_expires", columnList = "expires_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TelegramApprovalCallback {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Tek-kullanımlık callback nonce'u (callback_data içinde taşınır). */
    @Column(name = "token", nullable = false, length = 48, unique = true)
    private String token;

    /** Hangi onay talebi için (tenant + durum daima oradan okunur). */
    @Column(name = "approval_request_id", nullable = false)
    private UUID approvalRequestId;

    /** STRICT tenant izi — denormalize; callback'te hızlı guard için. */
    @Column(name = "business_id", nullable = false)
    private UUID businessId;

    /** Mesajın gittiği Telegram chat_id (DM ya da grup). */
    @Column(name = "chat_id", nullable = false, length = 64)
    private String chatId;

    /** Gönderilen mesajın Telegram message_id'si (sonradan düzenlemek için). */
    @Column(name = "message_id")
    private Long messageId;

    /** Mesajı gönderdiğimiz hedef kullanıcı (binding sahibi). */
    @Column(name = "target_user_id")
    private UUID targetUserId;

    /** Buton TTL'i — geçince callback reddedilir. */
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /** Tek-kullanım: token tüketildiği an (replay önleme). Null = kullanılmadı. */
    @Column(name = "consumed_at")
    private LocalDateTime consumedAt;

    /** Token'ı tüketen kullanıcı (forensik). */
    @Column(name = "consumed_by")
    private UUID consumedBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Transient
    public boolean isUsable() {
        return consumedAt == null
                && expiresAt != null
                && expiresAt.isAfter(LocalDateTime.now());
    }
}
