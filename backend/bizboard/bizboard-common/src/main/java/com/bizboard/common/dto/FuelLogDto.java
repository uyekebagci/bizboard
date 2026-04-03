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
public class FuelLogDto {

    private UUID id;

    @JsonProperty("inventory_item_id")
    private UUID inventoryItemId;

    @JsonProperty("fuel_type")
    private String fuelType;

    private BigDecimal amount;
    private BigDecimal cost;
    private LocalDate date;

    @JsonProperty("odometer_km")
    private BigDecimal odometerKm;

    private String station;

    @JsonProperty("receipt_url")
    private String receiptUrl;

    private String notes;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
