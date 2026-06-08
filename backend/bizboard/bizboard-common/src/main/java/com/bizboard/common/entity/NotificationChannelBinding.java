package com.bizboard.common.entity;

import com.bizboard.common.enums.NotificationChannelType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * WP f1fa3cd5: Kullanıcı ↔ harici kanal bağlaması (EXTENSION POINT).
 *
 * <p>Bir kullanıcının harici bir kanaldaki adresini tutar. IN_APP için kayıt
 * GEREKMEZ (kullanıcı zaten userId ile çözülür). Bu tablo, harici kanallar
 * eklenince doldurulacak — özellikle Telegram:</p>
 *
 * <ul>
 *   <li><b>TODO: Telegram (WP f1fa3cd5)</b> — {@code channel=TELEGRAM},
 *       {@code externalId = chat_id}. Bot token'ı kullanıcı bazlı değil
 *       global config (env: {@code APP_NOTIFICATIONS_TELEGRAM_BOT_TOKEN})
 *       olacağı için BURADA tutulmaz; yalnız kullanıcıya özel chat_id burada.</li>
 *   <li>EMAIL eklenirse {@code externalId = e-posta} (ya da User.email reuse).</li>
 * </ul>
 *
 * <p>{@code verified} alanı opt-in/doğrulama akışı için (Telegram'da kullanıcı
 * botu /start ile başlatınca true olur). Channel implementasyonu eklenene kadar
 * bu entity yalnız şema + extension point olarak durur.</p>
 *
 * <p>Benzersizlik: (user_id, channel) — kullanıcı başına kanal başına tek bağlama.</p>
 */
@Entity
@Table(name = "notification_channel_bindings",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_notif_binding_user_channel",
                columnNames = {"user_id", "channel"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationChannelBinding {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "channel", nullable = false, length = 20)
    private NotificationChannelType channel;

    /** Kanaldaki kullanıcı adresi. Telegram: chat_id; Email: e-posta. */
    @Column(name = "external_id", length = 200)
    private String externalId;

    /** Opt-in doğrulandı mı (örn. Telegram /start sonrası). */
    @Column(name = "verified", nullable = false)
    @Builder.Default
    private boolean verified = false;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
