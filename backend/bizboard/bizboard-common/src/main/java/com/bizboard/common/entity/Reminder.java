package com.bizboard.common.entity;

import com.bizboard.common.enums.ReminderRecurrence;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Kullanıcı-tanımlı standalone hatırlatıcı.
 *
 * <p>Genel amaçlı tek-sefer veya tekrarlı (DAILY/WEEKLY/MONTHLY) hatırlatma.
 * {@code ReminderScheduler} periyodik olarak {@code remindAt &le; now} ve
 * {@code enabled=true} olan, henüz fire etmemiş (NONE) ya da yeni periyoda
 * gelmiş hatırlatıcıları tarar; sahibine {@code REMINDER_DUE} bildirimi atar.</p>
 *
 * <p><b>Tenant sınırı:</b> {@code owner} — her kullanıcı yalnız kendi
 * hatırlatıcılarını görür/yönetir. {@code business} OPSİYONEL bağlamdır
 * (bildirimde işletme rozeti için).</p>
 */
@Entity
@Table(name = "reminders", indexes = {
        @Index(name = "idx_reminder_owner", columnList = "owner_id"),
        // Scheduler taraması: enabled + remindAt aralığı.
        @Index(name = "idx_reminder_due_scan", columnList = "enabled, remind_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Reminder {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Hatırlatıcının sahibi — bildirimi bu kullanıcı alır; tenant sınırı. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    /** Opsiyonel işletme bağlamı (bildirim rozeti / filtre için). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_id")
    private Business business;

    @Column(nullable = false, length = 200)
    private String title;

    /** Opsiyonel açıklama gövdesi. */
    @Column(columnDefinition = "TEXT")
    private String message;

    /** Bir sonraki tetikleme zamanı (tekrarlıda fire sonrası ötelenir). */
    @Column(name = "remind_at", nullable = false)
    private LocalDateTime remindAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private ReminderRecurrence recurrence = ReminderRecurrence.NONE;

    /** Aktif mi — false ise scheduler atlar (kullanıcı duraklatabilir). */
    @Column(nullable = false)
    @Builder.Default
    private boolean enabled = true;

    /** En son tetiklendiği an (audit / UI bilgisi; null = hiç tetiklenmedi). */
    @Column(name = "last_fired_at")
    private LocalDateTime lastFiredAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
