package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
public class BusinessTypeDto {

    private UUID id;
    private String category;
    private String label;
    private String icon;
    private String color;

    @JsonProperty("default_modules")
    private List<String> defaultModules;

    @JsonProperty("default_categories")
    private List<Map<String, String>> defaultCategories;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
