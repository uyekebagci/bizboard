package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Yakit kaydi. Agir arac / is makinesi gibi envanter kalemlerine ait yakit tüketim gecmisi.
 */
@Entity
@Table(name = "fuel_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FuelLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "inventory_item_id", nullable = false)
    private InventoryItem inventoryItem;

    /**
     * DIESEL, GASOLINE, LPG, ELECTRIC, OTHER
     */
    @Column(name = "fuel_type", nullable = false)
    private String fuelType;

    /** Alinan yakit miktari (litre) */
    @Column(precision = 15, scale = 2, nullable = false)
    private BigDecimal amount;

    /** Yakit maliyeti */
    @Column(precision = 15, scale = 2, nullable = false)
    private BigDecimal cost;

    @Column(nullable = false)
    private LocalDate date;

    /** Kilometre / saat sayaci */
    @Column(name = "odometer_km")
    private BigDecimal odometerKm;

    /** Yakit alinan yer */
    private String station;

    /** Fis/fatura URL */
    @Column(name = "receipt_url")
    private String receiptUrl;

    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
