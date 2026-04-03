package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
public class BusinessModuleDto {

    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    private String module;

    @JsonProperty("is_enabled")
    private boolean enabled;

    private Map<String, Object> config;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
