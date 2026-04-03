package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
public class PeriodSummaryDto {

    @JsonProperty("business_id")
    private UUID businessId;

    private String period; // "daily", "weekly", "monthly", "quarterly", "custom"

    @JsonProperty("period_start")
    private LocalDate periodStart;

    @JsonProperty("period_end")
    private LocalDate periodEnd;

    @JsonProperty("total_income")
    private BigDecimal totalIncome;

    @JsonProperty("total_expense")
    private BigDecimal totalExpense;

    @JsonProperty("net_profit")
    private BigDecimal netProfit;

    @JsonProperty("transaction_count")
    private int transactionCount;

    @JsonProperty("is_closed")
    private boolean closed;

    @JsonProperty("breakdown_by_category")
    private Map<String, Map<String, BigDecimal>> breakdownByCategory;

    /** Dönem gün sayısına göre oranlanmış sabit gider toplamı */
    @JsonProperty("fixed_cost_total")
    private BigDecimal fixedCostTotal;

    /** Sabit giderler dahil toplam gider */
    @JsonProperty("total_expense_with_fixed")
    private BigDecimal totalExpenseWithFixed;

    /** Sabit giderler dahil net kar */
    @JsonProperty("net_profit_with_fixed")
    private BigDecimal netProfitWithFixed;
}
