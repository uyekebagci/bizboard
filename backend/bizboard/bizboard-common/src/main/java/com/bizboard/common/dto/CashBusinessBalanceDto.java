package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * v1.6.3: işletmenin kasada nakit bakiyesi (NAKIT income - NAKIT expense).
 * Yalnız > 0 olan işletmeler dönülür (/api/cash/businesses).
 */
@Data
@Builder
public class CashBusinessBalanceDto {

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    /** Net nakit bakiyesi. */
    @JsonProperty("cash_balance")
    private BigDecimal cashBalance;
}
