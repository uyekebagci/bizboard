package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class DebtDto {

    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    private String direction; // RECEIVABLE or PAYABLE

    private String counterparty;

    private BigDecimal amount;

    private String currency;

    @JsonProperty("instrument_type")
    private String instrumentType;

    @JsonProperty("due_date")
    private LocalDate dueDate;

    @JsonProperty("is_settled")
    private boolean settled;

    @JsonProperty("settled_at")
    private LocalDateTime settledAt;

    private String description;

    @JsonProperty("document_url")
    private String documentUrl;

    @JsonProperty("admin_only")
    private boolean adminOnly;

    @JsonProperty("created_by_name")
    private String createdByName;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
