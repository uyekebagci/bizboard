package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §6 / TODO 6+7) — aylık kâr raporu.
 *
 * <p>İKİ eksen (§3.10 ortogonalite — ama Faz C'de tek raporda yan-yana özet):</p>
 * <ul>
 *   <li><b>Kategori-bazlı P&L (NE tür):</b> gelir + gider + masraf (gider≠masraf,
 *       §5) kategori kırılımı.</li>
 *   <li><b>Operatör/kâr-merkezi-bazlı kâr (KİM):</b> her operatör kasasının o
 *       dönemde biriken kârı + şirket residual.</li>
 * </ul>
 */
@Data
@Builder
public class MonthlyProfitReportDto {

    private int year;
    private int month;

    // ── Kategori-bazlı P&L (NE tür) ──
    @JsonProperty("total_income")
    private BigDecimal totalIncome;
    @JsonProperty("total_expense")
    private BigDecimal totalExpense;   // gider (kira/maaş/operatör payı)
    @JsonProperty("total_cost")
    private BigDecimal totalCost;      // masraf (banka komisyonu/transfer ücreti)
    /** net kâr = gelir − gider − masraf. */
    @JsonProperty("net_profit")
    private BigDecimal netProfit;

    @JsonProperty("income_by_category")
    private List<CategoryLine> incomeByCategory;
    @JsonProperty("expense_by_category")
    private List<CategoryLine> expenseByCategory;
    @JsonProperty("cost_by_category")
    private List<CategoryLine> costByCategory;

    // ── Operatör/kâr-merkezi-bazlı kâr (KİM) ──
    @JsonProperty("operator_profit")
    private List<OperatorLine> operatorProfit;
    /** Şirket residual kârı (operatöre gitmeyen kalan). */
    @JsonProperty("company_residual")
    private BigDecimal companyResidual;

    @Data
    @Builder
    public static class CategoryLine {
        @JsonProperty("category_id")
        private UUID categoryId;
        @JsonProperty("category_name")
        private String categoryName;
        private BigDecimal amount;
    }

    @Data
    @Builder
    public static class OperatorLine {
        @JsonProperty("account_id")
        private UUID accountId;
        @JsonProperty("account_name")
        private String accountName;
        @JsonProperty("operator_counterpart_id")
        private UUID operatorCounterpartId;
        @JsonProperty("operator_name")
        private String operatorName;
        private BigDecimal earned;
    }
}
