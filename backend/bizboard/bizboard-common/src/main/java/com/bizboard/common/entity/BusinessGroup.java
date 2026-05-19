package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.11: Kullanıcının kendi dashboard'unda işletmeleri kategorize ettiği grup.
 * <p>
 * KULLANICIYA ÖZELDIR — başka kullanıcı göremez. İzolasyon `user_id` üzerinden:
 * tüm sorgular `WHERE user_id = currentUser` ile filtrelenir.
 * <p>
 * Öncelik seviyeleri (priority):
 * <ul>
 *   <li>0 = PINNED — sticky, en üstte, 📌 ikonu</li>
 *   <li>1 = HIGH — vurgulanmış, ⭐ ikonu</li>
 *   <li>2 = NORMAL — default</li>
 * </ul>
 * <p>
 * Default sıralama: ORDER BY priority ASC, order_index ASC, created_at ASC.
 */
@Entity
@Table(name = "business_groups")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BusinessGroup {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Sahibi (CASCADE on user delete). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 80)
    private String name;

    /** Renk paletinden seçim — "zinc", "blue", "green", "orange", "red", "purple", "pink", "teal". */
    @Column(length = 16)
    private String color;

    /**
     * Aynı öncelik seviyesi içindeki sıralama. Drag-to-reorder yalnız aynı
     * priority içinde çalışır (PINNED'ler kendi arasında, HIGH'lar kendi arasında, vs.).
     */
    @Column(name = "order_index", nullable = false)
    @Builder.Default
    private int orderIndex = 0;

    /**
     * Öncelik seviyesi (0/1/2). Java tarafında int olarak tutulur — enum sıralama
     * sorunlarından kaçınmak için. Service katmanı 0..2 aralığını valide eder.
     */
    @Column(nullable = false)
    @org.hibernate.annotations.ColumnDefault("2")
    @Builder.Default
    private int priority = 2;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /** v1.6.11: priority sabit değerler — service ve mapper bunları kullanır. */
    public static final int PRIORITY_PINNED = 0;
    public static final int PRIORITY_HIGH = 1;
    public static final int PRIORITY_NORMAL = 2;
}
