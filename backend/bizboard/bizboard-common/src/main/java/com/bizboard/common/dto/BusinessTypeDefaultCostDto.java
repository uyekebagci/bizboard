package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class BusinessTypeDefaultCostDto {

    private UUID id;

    @JsonProperty("business_type_id")
    private UUID businessTypeId;

    private String name;

    private String category;

    private BigDecimal amount;

    private String currency;

    @JsonProperty("is_setup")
    private boolean setup;

    private String frequency;

    @JsonProperty("sort_order")
    private int sortOrder;

    private String notes;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
}
