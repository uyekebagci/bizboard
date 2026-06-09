package com.bizboard.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Envanter kalemi — tüm kategoriler (ağır araç, hafif ekipman, şantiye kurulum, sarf malzeme)
 * tek entity'de nullable alanlarla yönetilir.
 */
@Entity
@Table(name = "inventory_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InventoryItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    // ── Temel Bilgiler ──
    @Column(nullable = false)
    private String name;

    /**
     * HEAVY_VEHICLE, LIGHT_EQUIPMENT, SITE_SETUP, CONSUMABLE
     */
    @Column(nullable = false)
    private String category;

    /**
     * ACTIVE, BROKEN, IN_REPAIR, SCRAPPED, IN_STOCK
     */
    @Column(nullable = false)
    @Builder.Default
    private String status = "ACTIVE";

    // ── Kimlik Bilgileri ──
    @Column(name = "serial_number")
    private String serialNumber;

    @Column(name = "company_barcode")
    private String companyBarcode;

    private String brand;
    private String model;

    // ── Teknik Özellikler ──
    @Column(name = "power_capacity")
    private String powerCapacity;

    /**
     * BATTERY, GASOLINE, DIESEL, ELECTRIC_220V, ELECTRIC_380V
     */
    @Column(name = "energy_source")
    private String energySource;

    // ── Fiziksel Özellikler (Şantiye Kurulum) ──
    private String dimensions;

    @Column(name = "material_type")
    private String materialType;

    @Column(name = "module_count")
    private Integer moduleCount;

    @Column(name = "interior_details")
    private String interiorDetails;

    // ── Stok Bilgileri (Sarf Malzeme) ──
    private String sku;

    /**
     * PIECE, TON, KG, METER, CUBIC_METER, BOX, SET
     */
    private String unit;

    @Column(name = "minimum_stock", precision = 15, scale = 2)
    private BigDecimal minimumStock;

    @Column(name = "current_stock", precision = 15, scale = 2)
    private BigDecimal currentStock;

    /**
     * Manuel reorder eşiği (opsiyonel override). Boşsa {@code minimumStock} +
     * lead-time tampon ile otomatik hesaplanır (ReorderCalculator).
     */
    @Column(name = "reorder_point", precision = 15, scale = 2)
    private BigDecimal reorderPoint;

    /**
     * Tedarik temin süresi (gün). Reorder eşiği lead-time talebini bu süreyle
     * tamponlar. Default 7. (WP f4fe6d82)
     */
    @Column(name = "reorder_lead_days")
    @Builder.Default
    private Integer reorderLeadDays = 7;

    @Column(name = "warehouse_location")
    private String warehouseLocation;

    @Column(name = "batch_number")
    private String batchNumber;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    /**
     * ROUGH_CONSTRUCTION, FINE_CONSTRUCTION, SAFETY_EQUIPMENT, CHEMICAL, OTHER
     */
    @Column(name = "stock_category")
    private String stockCategory;

    // ── Zimmet ve Lokasyon ──
    @Column(name = "assigned_to")
    private String assignedTo;

    /**
     * PERSONNEL, SUBCONTRACTOR
     */
    @Column(name = "assigned_type")
    private String assignedType;

    private String location;

    // ── Bakım / Garanti ──
    @Column(name = "warranty_expiry")
    private LocalDate warrantyExpiry;

    @Column(name = "last_maintenance_date")
    private LocalDate lastMaintenanceDate;

    // ── Satın Alma ──
    @Column(name = "purchase_price", precision = 15, scale = 2)
    private BigDecimal purchasePrice;

    @Column(name = "purchase_date")
    private LocalDate purchaseDate;

    // ── Genel ──
    private String notes;

    @Column(name = "is_active")
    @Builder.Default
    private boolean active = true;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
