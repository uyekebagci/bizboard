package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Bakım / onarım kaydı. Her envanter kalemine ait bakım tarihçesi.
 */
@Entity
@Table(name = "maintenance_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MaintenanceLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "inventory_item_id", nullable = false)
    private InventoryItem inventoryItem;

    /**
     * OIL_CHANGE, FILTER_CHANGE, REPAIR, PART_REPLACEMENT, INSPECTION, OTHER
     */
    @Column(name = "maintenance_type", nullable = false)
    private String maintenanceType;

    private String description;

    @Column(precision = 15, scale = 2)
    private BigDecimal cost;

    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "performed_by")
    private String performedBy;

    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
