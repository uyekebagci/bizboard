package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

/**
 * Ledger v2 (Faz C, §3.4): POS kâr-payı global config (sahip%/Fatih%/Tuncay%).
 */
@Data
@Builder
public class ProfitShareConfigDto {
    /** Sahip baz oranı (yüzde) — RATE_SPREAD/MARGIN_PCT marj temeli. */
    @JsonProperty("owner_base_pct")
    private BigDecimal ownerBasePct;
    /** Fatih marj çarpanı (yüzde) — MARGIN_PCT. */
    @JsonProperty("fatih_margin_pct")
    private BigDecimal fatihMarginPct;
    /** Tuncay spread baz oranı (yüzde) — OWNER_COMMISSION. */
    @JsonProperty("tuncay_spread_pct")
    private BigDecimal tuncaySpreadPct;
}
