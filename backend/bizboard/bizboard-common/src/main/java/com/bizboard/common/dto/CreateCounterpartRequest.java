package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateCounterpartRequest {

    @NotBlank
    private String name;

    /** Opsiyonel. Verilirse VKN (10) ya da TCKN (11) format/checksum kontrolü yapılır. */
    @JsonProperty("tax_id")
    private String taxId;

    @JsonProperty("tax_office")
    private String taxOffice;

    /** CUSTOMER / SUPPLIER / BOTH / OTHER. Verilmezse OTHER. */
    private String role;

    @JsonProperty("contact_name")
    private String contactName;

    @JsonProperty("contact_phone")
    private String contactPhone;

    @JsonProperty("contact_email")
    private String contactEmail;

    private String address;

    @JsonProperty("payment_terms_days")
    private Integer paymentTermsDays;

    private String notes;
}
