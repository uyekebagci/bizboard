package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class CreateDebtRequest {

    @NotBlank
    private String direction; // RECEIVABLE or PAYABLE

    @NotBlank
    private String counterparty;

    @NotNull
    @Positive
    private BigDecimal amount;

    private String currency;

    @NotBlank
    @JsonProperty("instrument_type")
    private String instrumentType; // CEK, SENET, NAKIT veya özel

    @JsonProperty("due_date")
    private LocalDate dueDate;

    private String description;

    @JsonProperty("document_url")
    private String documentUrl;

    @JsonProperty("admin_only")
    private Boolean adminOnly;
}
