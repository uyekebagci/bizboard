package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * WP e4dc5271 (Beta v1.4): Quick action DTO — GET/POST/PATCH response.
 */
@Data
@Builder
public class QuickActionDto {

    private UUID id;

    @JsonProperty("user_id")
    private UUID userId;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    private String name;

    /**
     * Tx template — JSONB. Frontend execute akışında bu üzerine override
     * uygular. Alanlar: direction, kind, amount, payment_method,
     * bank_account_id, pos_device_id, counterpart_id, applied_pos_rate,
     * applied_our_commission_rate, category, description, transfer için
     * to_bank_account_id ve to_external_name.
     */
    @JsonProperty("tx_template")
    private Map<String, Object> txTemplate;

    private String icon;
    private String color;

    @JsonProperty("order_index")
    private int orderIndex;

    @JsonProperty("usage_count")
    private int usageCount;

    @JsonProperty("last_used_at")
    private LocalDateTime lastUsedAt;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
}
