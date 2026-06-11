package com.bizboard.common.entity;

import com.bizboard.common.enums.NotificationEvent;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * CHT-2 / GRP-3 (Telegram Admin Hedefli Gönderim): chat başına event tercihi.
 *
 * <p>Bir bağlı Telegram chat'in ({@link NotificationChannelBinding}) hangi
 * {@link NotificationEvent}'leri alacağını kontrol eder. Bu model hem WP
 * a07e3466 GUN-3'teki "per-chat tercih modeli" (GRP-3) hem de CHT-2 ekranını
 * KARŞILAR — TEK model, çakışma/duplicate YOK.</p>
 *
 * <p>Varsayılan: bir binding için kayıt YOKSA o event o chat'e GİTMEZ (opt-in;
 * harici kanal varsayılan kapalı prensibiyle tutarlı). Admin chat detayında
 * açıkça aktive eder.</p>
 *
 * <p>İlişki: {@code binding_id} → {@link NotificationChannelBinding} (1-N).
 * Benzersizlik: (binding_id, event) tek satır. Binding silinince ON DELETE
 * CASCADE ile düşer.</p>
 */
@Entity
@Table(name = "telegram_chat_event_preferences",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_tg_chat_event_pref_binding_event",
                columnNames = {"binding_id", "event"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TelegramChatEventPreference {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Bağlı chat (NotificationChannelBinding.id). */
    @Column(name = "binding_id", nullable = false)
    private UUID bindingId;

    /**
     * Hangi olay. {@code columnDefinition} ile Hibernate'in enum CHECK üretmesi
     * engellenir (NotificationPreference ile aynı gerekçe — yeni event eklenince
     * eski CHECK insert'i bozmasın).
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "event", nullable = false, columnDefinition = "varchar(40)")
    private NotificationEvent event;

    @Column(name = "enabled", nullable = false)
    @Builder.Default
    private boolean enabled = true;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
