package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class InventorySummaryDto {

    @JsonProperty("total_items")
    private long totalItems;

    @JsonProperty("heavy_vehicle_count")
    private long heavyVehicleCount;

    @JsonProperty("light_equipment_count")
    private long lightEquipmentCount;

    @JsonProperty("site_setup_count")
    private long siteSetupCount;

    @JsonProperty("consumable_count")
    private long consumableCount;

    @JsonProperty("active_count")
    private long activeCount;

    @JsonProperty("broken_count")
    private long brokenCount;

    @JsonProperty("in_repair_count")
    private long inRepairCount;

    @JsonProperty("low_stock_count")
    private long lowStockCount;

    @JsonProperty("warranty_expiring_count")
    private long warrantyExpiringCount;

    @JsonProperty("total_value")
    private BigDecimal totalValue;
}
