package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Data
public class CreateInventoryItemRequest {

    @NotBlank
    private String name;

    @NotBlank
    private String category; // HEAVY_VEHICLE, LIGHT_EQUIPMENT, SITE_SETUP, CONSUMABLE

    private String status; // defaults to ACTIVE

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

    // Fiziksel
    private String dimensions;

    @JsonProperty("material_type")
    private String materialType;

    @JsonProperty("module_count")
    private Integer moduleCount;

    @JsonProperty("interior_details")
    private String interiorDetails;

    // Stok
    private String sku;
    private String unit;

    @JsonProperty("minimum_stock")
    private BigDecimal minimumStock;

    @JsonProperty("current_stock")
    private BigDecimal currentStock;

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

    private String notes;
}
