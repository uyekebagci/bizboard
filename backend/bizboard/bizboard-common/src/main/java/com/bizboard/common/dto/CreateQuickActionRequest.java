package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.Map;
import java.util.UUID;

/**
 * WP e4dc5271: POST /quick-actions body.
 */
@Data
public class CreateQuickActionRequest {

    @NotNull
    @JsonProperty("business_id")
    private UUID businessId;

    @NotBlank
    @Size(max = 100)
    private String name;

    /**
     * Zorunlu alanlar template içinde: direction, payment_method, kind.
     * Diğerleri opsiyonel — execute zamanı override gelir.
     */
    @NotNull
    @JsonProperty("tx_template")
    private Map<String, Object> txTemplate;

    private String icon;
    private String color;
}
