package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.4): ProfitShareRule upsert isteği (admin).
 */
@Data
public class ProfitShareRuleRequest {

    /** RESIDUAL kuralı dışında operatör zorunlu (servis doğrular). */
    @JsonProperty("operator_counterpart_id")
    private UUID operatorCounterpartId;

    /** RESIDUAL dışında hedef kâr-merkezi kasası zorunlu. */
    @JsonProperty("target_subcash_account_id")
    private UUID targetSubCashAccountId;

    /** NULL = tüm cihazlar (operatör-bazlı); dolu = cihaz-bazlı override. */
    @JsonProperty("pos_device_id")
    private UUID posDeviceId;

    @NotNull(message = "rule_type zorunlu (RATE_SPREAD/MARGIN_PCT/OWNER_COMMISSION/RESIDUAL)")
    @JsonProperty("rule_type")
    private String ruleType;

    /** Oran override (yüzde) — NULL = global config'e düş (§3.4). */
    @JsonProperty("override_pct")
    private BigDecimal overridePct;

    private Boolean active;
    private Integer priority;
    private String notes;
}
