package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.7.x WP fbb2ef55: POST /payment-instruments/{id}/clear body.
 */
@Data
public class ClearInstrumentRequest {

    @JsonProperty("cleared_at")
    private LocalDateTime clearedAt;

    @NotNull
    @JsonProperty("bank_account_id")
    private UUID bankAccountId;
}
