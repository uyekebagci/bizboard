package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Kapsamlı finans modülü DTO'su.
 * Aylık trendler, kategori kırılımları, işletme bazlı analizler ve
 * en yüksek gider/gelir kayıtlarını tek bir response'da döndürür.
 */
@Data
@Builder
public class FinanceOverviewDto {

    // ─── Mevcut Dönem Özeti ─────────────────────────────────────────────

    @JsonProperty("current_period")
    private PeriodData currentPeriod;

    @JsonProperty("previous_period")
    private PeriodData previousPeriod;

    // ─── Aylık Trend (son N ay) ─────────────────────────────────────────

    @JsonProperty("monthly_trend")
    private List<MonthData> monthlyTrend;

    // ─── Kategori Kırılımı ──────────────────────────────────────────────

    @JsonProperty("expense_by_category")
    private List<CategoryData> expenseByCategory;

    @JsonProperty("income_by_category")
    private List<CategoryData> incomeByCategory;

    // ─── İşletme Bazlı Kırılım ─────────────────────────────────────────

    @JsonProperty("business_breakdown")
    private List<BusinessFinance> businessBreakdown;

    // ─── En Yüksek İşlemler ─────────────────────────────────────────────

    @JsonProperty("top_expenses")
    private List<TopTransaction> topExpenses;

    @JsonProperty("top_incomes")
    private List<TopTransaction> topIncomes;

    // ─── Günlük Nakit Akışı (son 30 gün) ────────────────────────────────

    @JsonProperty("daily_cash_flow")
    private List<DailyCashFlow> dailyCashFlow;

    // ─── İç Sınıflar ───────────────────────────────────────────────────

    @Data
    @Builder
    public static class PeriodData {
        private BigDecimal income;
        private BigDecimal expense;

        @JsonProperty("net_profit")
        private BigDecimal netProfit;

        @JsonProperty("fixed_cost")
        private BigDecimal fixedCost;

        @JsonProperty("total_expense_with_fixed")
        private BigDecimal totalExpenseWithFixed;

        @JsonProperty("net_profit_with_fixed")
        private BigDecimal netProfitWithFixed;

        @JsonProperty("transaction_count")
        private int transactionCount;

        @JsonProperty("income_change_pct")
        private BigDecimal incomeChangePct;

        @JsonProperty("expense_change_pct")
        private BigDecimal expenseChangePct;

        @JsonProperty("profit_change_pct")
        private BigDecimal profitChangePct;
    }

    @Data
    @Builder
    public static class MonthData {
        private int year;
        private int month;
        private String label;
        private BigDecimal income;
        private BigDecimal expense;

        @JsonProperty("net_profit")
        private BigDecimal netProfit;

        @JsonProperty("fixed_cost")
        private BigDecimal fixedCost;

        @JsonProperty("transaction_count")
        private int transactionCount;
    }

    @Data
    @Builder
    public static class CategoryData {
        private String name;
        private String icon;
        private String color;
        private BigDecimal amount;
        private BigDecimal percentage;

        @JsonProperty("transaction_count")
        private int transactionCount;
    }

    @Data
    @Builder
    public static class BusinessFinance {
        @JsonProperty("business_id")
        private UUID businessId;

        @JsonProperty("business_name")
        private String businessName;

        private String color;
        private BigDecimal income;
        private BigDecimal expense;

        @JsonProperty("net_profit")
        private BigDecimal netProfit;

        @JsonProperty("fixed_cost")
        private BigDecimal fixedCost;

        @JsonProperty("profit_margin")
        private BigDecimal profitMargin;

        @JsonProperty("transaction_count")
        private int transactionCount;
    }

    @Data
    @Builder
    public static class TopTransaction {
        private UUID id;

        @JsonProperty("business_name")
        private String businessName;

        private String description;

        @JsonProperty("category_name")
        private String categoryName;

        private BigDecimal amount;
        private String date;
        private String direction;
    }

    @Data
    @Builder
    public static class DailyCashFlow {
        private String date;
        private BigDecimal income;
        private BigDecimal expense;

        @JsonProperty("net")
        private BigDecimal net;

        @JsonProperty("cumulative")
        private BigDecimal cumulative;
    }
}
