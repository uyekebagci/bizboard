package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.4): ProfitShareRule görünümü (admin config ekranı).
 */
@Data
@Builder
public class ProfitShareRuleDto {
    private UUID id;
    @JsonProperty("operator_counterpart_id")
    private UUID operatorCounterpartId;
    @JsonProperty("operator_name")
    private String operatorName;
    @JsonProperty("target_subcash_account_id")
    private UUID targetSubCashAccountId;
    @JsonProperty("target_subcash_account_name")
    private String targetSubCashAccountName;
    @JsonProperty("pos_device_id")
    private UUID posDeviceId;
    @JsonProperty("pos_device_name")
    private String posDeviceName;
    @JsonProperty("rule_type")
    private String ruleType;
    @JsonProperty("override_pct")
    private BigDecimal overridePct;
    private boolean active;
    private int priority;
    private String notes;
}
