package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.20 (WP-3): POS cihazı DTO'su.
 */
@Data
@Builder
public class PosDeviceDto {

    private UUID id;

    /** v1.6.23.20 (Security WP / arch-rules §1.1): tenant binding. */
    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    private String name;

    @JsonProperty("owner_counterpart_id")
    private UUID ownerCounterpartId;

    @JsonProperty("owner_counterpart_name")
    private String ownerCounterpartName;

    @JsonProperty("bank_name")
    private String bankName;

    @JsonProperty("default_rate")
    private BigDecimal defaultRate;

    @JsonProperty("last_used_rate")
    private BigDecimal lastUsedRate;

    @JsonProperty("is_active")
    private boolean active;

    private String notes;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
