package com.bizboard.common.entity;

import com.bizboard.common.enums.NotificationChannelType;
import com.bizboard.common.enums.NotificationEvent;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * WP f1fa3cd5: Kullanıcı bazlı bildirim tercihi.
 *
 * <p>Bir kullanıcının belirli bir {@link NotificationEvent} için belirli bir
 * {@link NotificationChannelType} üzerinden bildirim alıp almayacağını tutar.
 * Kayıt YOKSA dispatch katmanı makul varsayılana düşer (in-app açık).</p>
 *
 * <p>Mimari sınıf: <b>C (Operational)</b> — kullanıcıya bağlı sistem verisi;
 * {@code business_id} yok (tercih kullanıcı geneli). Erişim kontrolü "yalnız
 * kendi tercihin" prensibiyle servis katmanında uygulanır.</p>
 *
 * <p>Benzersizlik: (user_id, event, channel) üçlüsü tek satır.</p>
 */
@Entity
@Table(name = "notification_preferences",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_notif_pref_user_event_channel",
                columnNames = {"user_id", "event", "channel"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationPreference {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event", nullable = false, length = 40)
    private NotificationEvent event;

    @Enumerated(EnumType.STRING)
    @Column(name = "channel", nullable = false, length = 20)
    private NotificationChannelType channel;

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
