package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * v1.6.21 (WP-4): PATCH /pos-devices/{id} body. Tüm alanlar opsiyonel —
 * yalnız null olmayanlar uygulanır (partial update).
 */
@Data
public class UpdatePosDeviceRequest {

    @Size(max = 120)
    private String name;

    @JsonProperty("owner_counterpart_id")
    private UUID ownerCounterpartId;

    @JsonProperty("bank_name")
    @Size(max = 120)
    private String bankName;

    @JsonProperty("default_rate")
    private BigDecimal defaultRate;

    @JsonProperty("is_active")
    private Boolean active;

    private String notes;
}
