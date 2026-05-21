package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

/**
 * v1.6.23.27 (UI Fix WP TODO 7cc85a10): POST /bank-accounts/{subCashId}/assignments body.
 */
@Data
public class CreateSubCashAssignmentRequest {

    /** COUNTERPART / POS_DEVICE / BANK_ACCOUNT */
    @NotBlank
    @JsonProperty("entity_type")
    private String entityType;

    @NotNull
    @JsonProperty("entity_id")
    private UUID entityId;
}
