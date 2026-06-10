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

    /**
     * Bug fix (notif-pref 500): {@code columnDefinition} ile Hibernate'in bu enum
     * kolonu için OTOMATİK CHECK constraint üretmesi ENGELLENİR. Aksi halde
     * Hibernate, tablo ilk oluşurken o anki enum değerlerini bir CHECK'e gömer;
     * sonradan enum'a yeni olay (TAX_DEADLINE_DUE_SOON, LOW_STOCK, WARRANTY_EXPIRING,
     * NEW_TRANSACTION, FIRM_ACCESS_GRANTED) eklendiğinde {@code ddl-auto=update}
     * mevcut CHECK'i GÜNCELLEMEZ → yeni değer insert'i constraint'i ihlal eder →
     * DataIntegrityViolationException → 500. Enum geçerliliği zaten Java tarafında
     * (@Enumerated STRING) garanti edilir; brittle DB CHECK'e gerek yok.
     * Mevcut DB'lerdeki eski CHECK'i {@code NotificationPreferenceConstraintRepair} düşürür.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "event", nullable = false, columnDefinition = "varchar(40)")
    private NotificationEvent event;

    @Enumerated(EnumType.STRING)
    @Column(name = "channel", nullable = false, columnDefinition = "varchar(20)")
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
