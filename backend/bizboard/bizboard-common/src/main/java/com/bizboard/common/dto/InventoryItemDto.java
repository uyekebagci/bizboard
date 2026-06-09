package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class InventoryItemDto {

    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    private String name;
    private String category;
    private String status;

    // Kimlik
    @JsonProperty("serial_number")
    private String serialNumber;

    @JsonProperty("company_barcode")
    private String companyBarcode;

    private String brand;
    private String model;

    // Teknik
    @JsonProperty("power_capacity")
    private String powerCapacity;

    @JsonProperty("energy_source")
    private String energySource;

    // Fiziksel (Şantiye Kurulum)
    private String dimensions;

    @JsonProperty("material_type")
    private String materialType;

    @JsonProperty("module_count")
    private Integer moduleCount;

    @JsonProperty("interior_details")
    private String interiorDetails;

    // Stok (Sarf Malzeme)
    private String sku;
    private String unit;

    @JsonProperty("minimum_stock")
    private BigDecimal minimumStock;

    @JsonProperty("current_stock")
    private BigDecimal currentStock;

    /** Manuel reorder eşiği (opsiyonel). (WP f4fe6d82) */
    @JsonProperty("reorder_point")
    private BigDecimal reorderPoint;

    /** Tedarik temin süresi (gün). */
    @JsonProperty("reorder_lead_days")
    private Integer reorderLeadDays;

    /** Hesaplanan etkili reorder eşiği (manuel ya da minimum+lead tamponu). */
    @JsonProperty("effective_reorder_point")
    private BigDecimal effectiveReorderPoint;

    /** {@code current_stock <= effective_reorder_point} → sipariş önerisi. */
    @JsonProperty("needs_reorder")
    private boolean needsReorder;

    /** Önerilen sipariş miktarı (eşik üstüne çıkmak için), opsiyonel ipucu. */
    @JsonProperty("suggested_order_quantity")
    private BigDecimal suggestedOrderQuantity;

    @JsonProperty("warehouse_location")
    private String warehouseLocation;

    @JsonProperty("batch_number")
    private String batchNumber;

    @JsonProperty("expiry_date")
    private LocalDate expiryDate;

    @JsonProperty("stock_category")
    private String stockCategory;

    // Zimmet
    @JsonProperty("assigned_to")
    private String assignedTo;

    @JsonProperty("assigned_type")
    private String assignedType;

    private String location;

    // Bakım / Garanti
    @JsonProperty("warranty_expiry")
    private LocalDate warrantyExpiry;

    @JsonProperty("last_maintenance_date")
    private LocalDate lastMaintenanceDate;

    // Satın Alma
    @JsonProperty("purchase_price")
    private BigDecimal purchasePrice;

    @JsonProperty("purchase_date")
    private LocalDate purchaseDate;

    // Genel
    private String notes;

    @JsonProperty("is_active")
    private boolean active;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;

    // Joined
    @JsonProperty("business_name")
    private String businessName;
}
