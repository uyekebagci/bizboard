package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class CounterpartDto {

    private UUID id;

    private String name;

    @JsonProperty("tax_id")
    private String taxId;

    @JsonProperty("tax_office")
    private String taxOffice;

    /** CUSTOMER / SUPPLIER / BOTH / OTHER */
    private String role;

    @JsonProperty("contact_name")
    private String contactName;

    @JsonProperty("contact_phone")
    private String contactPhone;

    @JsonProperty("contact_email")
    private String contactEmail;

    private String address;

    @JsonProperty("current_balance")
    private BigDecimal currentBalance;

    @JsonProperty("payment_terms_days")
    private Integer paymentTermsDays;

    private String notes;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
}
