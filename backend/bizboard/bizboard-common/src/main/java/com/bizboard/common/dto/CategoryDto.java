package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class CategoryDto {

    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    private String name;
    private String direction;
    private String icon;
    private String color;

    @JsonProperty("sort_order")
    private int sortOrder;

    @JsonProperty("is_active")
    private boolean active;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
