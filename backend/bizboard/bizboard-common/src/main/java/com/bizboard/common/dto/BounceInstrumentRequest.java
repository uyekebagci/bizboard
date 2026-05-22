package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * v1.7.x WP fbb2ef55: POST /payment-instruments/{id}/bounce body.
 */
@Data
public class BounceInstrumentRequest {
    @JsonProperty("bounced_at")
    private LocalDateTime bouncedAt;

    private String reason;
}
