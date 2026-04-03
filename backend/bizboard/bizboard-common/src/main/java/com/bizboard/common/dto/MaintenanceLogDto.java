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
public class MaintenanceLogDto {

    private UUID id;

    @JsonProperty("inventory_item_id")
    private UUID inventoryItemId;

    @JsonProperty("maintenance_type")
    private String maintenanceType;

    private String description;
    private BigDecimal cost;
    private LocalDate date;

    @JsonProperty("performed_by")
    private String performedBy;

    private String notes;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
