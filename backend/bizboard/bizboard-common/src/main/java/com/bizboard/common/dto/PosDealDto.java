package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.5): POS deal + hesaplanan kâr-payı bacakları (FE için).
 */
@Data
@Builder
public class PosDealDto {

    private UUID id;
    @JsonProperty("deal_date")
    private LocalDate dealDate;
    @JsonProperty("gross_amount")
    private BigDecimal grossAmount;
    @JsonProperty("customer_rate")
    private BigDecimal customerRate;

    @JsonProperty("pos_device_id")
    private UUID posDeviceId;
    @JsonProperty("pos_device_name")
    private String posDeviceName;
    @JsonProperty("owner_company_name")
    private String ownerCompanyName;
    @JsonProperty("bank_rate")
    private BigDecimal bankRate;

    @JsonProperty("referrer_counterpart_id")
    private UUID referrerCounterpartId;
    @JsonProperty("referrer_name")
    private String referrerName;

    @JsonProperty("owner_account_id")
    private UUID ownerAccountId;
    @JsonProperty("owner_account_name")
    private String ownerAccountName;

    @JsonProperty("settlement_batch_id")
    private UUID settlementBatchId;
    @JsonProperty("avg_commission_rate")
    private BigDecimal avgCommissionRate;

    private String status;
    private String notes;

    /** Hesaplanan kâr-payı bacakları (operatör + tutar + provisional/final). */
    private List<ShareLegDto> shares;

    @Data
    @Builder
    public static class ShareLegDto {
        @JsonProperty("rule_type")
        private String ruleType;
        @JsonProperty("operator_counterpart_id")
        private UUID operatorCounterpartId;
        @JsonProperty("operator_name")
        private String operatorName;
        @JsonProperty("target_subcash_account_id")
        private UUID targetSubCashAccountId;
        @JsonProperty("target_subcash_account_name")
        private String targetSubCashAccountName;
        private BigDecimal amount;
        private boolean provisional;
    }
}
