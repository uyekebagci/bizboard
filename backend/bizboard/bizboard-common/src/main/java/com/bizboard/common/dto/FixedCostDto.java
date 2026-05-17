package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class FixedCostDto {
    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    private String name;
    private String type;
    private BigDecimal amount;
    private String frequency;

    @JsonProperty("is_auto")
    private boolean auto;

    private String notes;

    @JsonProperty("is_active")
    private boolean active;

    /** v1.5.9: recurring engine için "her ay otomatik tx üret" bayrağı. */
    @JsonProperty("auto_generate")
    private boolean autoGenerate;

    /** v1.5.9: son otomatik üretim zamanı (null → henüz hiç tetiklenmedi). */
    @JsonProperty("last_auto_run")
    private LocalDateTime lastAutoRun;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
}
