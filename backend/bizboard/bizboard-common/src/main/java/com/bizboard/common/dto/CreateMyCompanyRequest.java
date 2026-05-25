package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.time.LocalDate;

@Data
public class CreateMyCompanyRequest {

    @NotBlank
    @JsonProperty("legal_name")
    private String legalName;

    /** VKN (10 hane) veya TCKN (11 hane). Opsiyonel; verilirse format/checksum kontrolünden geçer. */
    @JsonProperty("tax_id")
    private String taxId;

    @JsonProperty("tax_office")
    private String taxOffice;

    @JsonProperty("trade_registry_no")
    private String tradeRegistryNo;

    /** AS / LTD / SAHIS / KOOP / DERNEK / OTHER. Verilmezse OTHER. */
    @JsonProperty("company_type")
    private String companyType;

    @JsonProperty("activity_code")
    private String activityCode;

    @JsonProperty("incorporated_at")
    private LocalDate incorporatedAt;

    @JsonProperty("mersis_no")
    private String mersisNo;

    private String address;

    @JsonProperty("contact_name")
    private String contactName;

    @JsonProperty("contact_phone")
    private String contactPhone;

    @JsonProperty("contact_email")
    private String contactEmail;

    /** v1.7.x WP TODO ba04debb: opsiyonel grup. null veya geçerli group_id. */
    @JsonProperty("group_id")
    private java.util.UUID groupId;
}
