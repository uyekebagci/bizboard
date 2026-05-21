package com.bizboard.common.entity;

import com.bizboard.common.enums.SubCashEntityType;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.23.27 (UI Fix WP TODO fbf92aa9 + 52459999): Sub-Cash Aggregator
 * assignment kaydı.
 *
 * <p>Bir entity ({@link SubCashEntityType}: COUNTERPART / POS_DEVICE /
 * BANK_ACCOUNT) yalnız 1 sub-cash'e atanabilir
 * (UNIQUE(entity_type, entity_id) DB seviyesi). Sub-cash silinince cascade
 * delete; entity verisi etkilenmez.</p>
 *
 * <p>Aggregate kuralı (TODO d884a0ec):
 * <ul>
 *   <li>BANK_ACCOUNT (CHECKING/SAVINGS/CASH_HOLDER) → {@code current_balance}</li>
 *   <li>COUNTERPART → 0 (sadece tx grouping)</li>
 *   <li>POS_DEVICE → 0 (sadece tx grouping)</li>
 * </ul>
 * </p>
 *
 * <p>INVARIANT (TODO 73dd2694):
 * {@code Σ(sub.aggregate) + unassigned.aggregate == MAIN.aggregate}</p>
 */
@Entity
@Table(name = "sub_cash_assignments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubCashAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Atandığı sub-cash (bank_account with type=SUB_CASH). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sub_cash_id", nullable = false)
    private BankAccount subCash;

    /** Tenant binding — cross-tenant assignment validation için. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    @Enumerated(EnumType.STRING)
    @Column(name = "entity_type", nullable = false, length = 16)
    private SubCashEntityType entityType;

    @Column(name = "entity_id", nullable = false)
    private UUID entityId;

    @Column(name = "assigned_at", nullable = false)
    private LocalDateTime assignedAt;

    @Column(name = "assigned_by")
    private UUID assignedBy;

    @PrePersist
    void onPersist() {
        if (assignedAt == null) assignedAt = LocalDateTime.now();
    }
}
