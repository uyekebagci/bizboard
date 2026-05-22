package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.UUID;

@Data
public class CreateCounterpartRequest {

    /**
     * v1.6.23.20 (Security WP / arch-rules §1.1): counterpart tenant binding.
     * UPDATE'lerde verilmezse mevcut değer korunur (immutable tercih edilebilir).
     */
    @JsonProperty("business_id")
    private UUID businessId;

    @NotBlank
    private String name;

    /** Opsiyonel. Verilirse VKN (10) ya da TCKN (11) format/checksum kontrolü yapılır. */
    @JsonProperty("tax_id")
    private String taxId;

    @JsonProperty("tax_office")
    private String taxOffice;

    /** CUSTOMER / SUPPLIER / BOTH / OTHER. Verilmezse OTHER. */
    private String role;

    /**
     * v1.7.x (UI Fix WP TODO 0b78f4eb): Varlık tipi — PERSON veya FIRM.
     * Verilmezse mevcut default (entity = FIRM) korunur.
     */
    private String kind;

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
