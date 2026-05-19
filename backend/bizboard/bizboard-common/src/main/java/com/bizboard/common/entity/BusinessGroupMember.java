package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.11: Bir {@link BusinessGroup}'a üye olan işletme.
 * <p>
 * Bir işletme aynı kullanıcıya ait BİRDEN FAZLA gruba üye olabilir
 * (unique constraint sadece (group_id, business_id) çiftinde — aynı işletme
 * aynı gruba iki kez eklenemez). Farklı gruplara üyelik serbest.
 * <p>
 * Bir grup silindiğinde üye satırları cascade ile temizlenir.
 */
@Entity
@Table(
        name = "business_group_members",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_group_business",
                        columnNames = {"group_id", "business_id"}
                )
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BusinessGroupMember {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private BusinessGroup group;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /** Grup içindeki sıralama (drag-to-reorder ile değişir). */
    @Column(name = "order_in_group", nullable = false)
    @Builder.Default
    private int orderInGroup = 0;

    @CreationTimestamp
    @Column(name = "added_at", updatable = false)
    private LocalDateTime addedAt;
}
