package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
public class FixedCostSummaryDto {

    @JsonProperty("total_monthly_cost")
    private BigDecimal totalMonthlyCost;

    @JsonProperty("rent_cost")
    private BigDecimal rentCost;

    @JsonProperty("personnel_cost")
    private BigDecimal personnelCost;

    @JsonProperty("other_cost")
    private BigDecimal otherCost;

    @JsonProperty("fixed_costs")
    private List<FixedCostDto> fixedCosts;
}
