package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;

import java.math.BigDecimal;

/** Default cost create/update payload (admin tarafı). */
@Data
public class UpsertDefaultCostRequest {

    @NotBlank
    private String name;

    /** RENT / PERSONNEL / UTILITY / SUPPLIES / MARKETING / LEGAL / OTHER. */
    private String category;

    @PositiveOrZero
    private BigDecimal amount;

    private String currency;

    @JsonProperty("is_setup")
    private boolean setup;

    /** MONTHLY / YEARLY / QUARTERLY — setup=true ise yoksayılır. */
    private String frequency;

    @JsonProperty("sort_order")
    private Integer sortOrder;

    private String notes;
}
