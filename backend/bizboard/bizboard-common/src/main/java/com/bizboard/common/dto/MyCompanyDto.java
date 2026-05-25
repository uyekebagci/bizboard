package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class MyCompanyDto {

    private UUID id;

    @JsonProperty("legal_name")
    private String legalName;

    @JsonProperty("tax_id")
    private String taxId;

    @JsonProperty("tax_office")
    private String taxOffice;

    @JsonProperty("trade_registry_no")
    private String tradeRegistryNo;

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

    @JsonProperty("is_default")
    private boolean isDefault;

    // v1.7.x WP TODO ba04debb: opsiyonel grup
    @JsonProperty("group_id")
    private UUID groupId;

    @JsonProperty("group_name")
    private String groupName;

    @JsonProperty("group_color")
    private String groupColor;

    @JsonProperty("group_icon")
    private String groupIcon;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
}
