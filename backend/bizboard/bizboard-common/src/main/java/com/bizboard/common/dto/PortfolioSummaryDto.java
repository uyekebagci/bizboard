package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class PortfolioSummaryDto {

    @JsonProperty("total_income")
    private BigDecimal totalIncome;

    @JsonProperty("total_expense")
    private BigDecimal totalExpense;

    @JsonProperty("net_profit")
    private BigDecimal netProfit;

    @JsonProperty("business_count")
    private int businessCount;

    /** Dönem gün sayısına göre oranlanmış toplam sabit gider */
    @JsonProperty("fixed_cost_total")
    private BigDecimal fixedCostTotal;

    /** Sabit giderler dahil toplam gider */
    @JsonProperty("total_expense_with_fixed")
    private BigDecimal totalExpenseWithFixed;

    /** Sabit giderler dahil net kar */
    @JsonProperty("net_profit_with_fixed")
    private BigDecimal netProfitWithFixed;

    private List<BusinessSummary> businesses;

    @Data
    @Builder
    public static class BusinessSummary {
        @JsonProperty("business_id")
        private UUID businessId;

        private BigDecimal income;
        private BigDecimal expense;
        private BigDecimal profit;

        @JsonProperty("fixed_cost")
        private BigDecimal fixedCost;
    }
}
