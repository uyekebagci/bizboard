package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * v1.7.x WP 8b961444 TODO 474b775c: Sub-cash periyot geliri özeti.
 *
 * <p>Multi-attribution: bir tx, sub-cash'in counterpart / pos_device /
 * bank_account atamalarından herhangi biriyle eşleşirse sayılır.
 * Sub-cash'ler arası OVERLAP normaldir — Σ sub.income > KONSOLİDE NET
 * olabilir.</p>
 *
 * <p>income_value formülü KONSOLİDE NET ile aynı (POS profit, non-POS
 * gross, gider negatif, transfer 0).</p>
 */
@Data
@Builder
public class SubCashIncomeSummaryDto {

    @JsonProperty("sub_cash_id")
    private UUID subCashId;

    @JsonProperty("from_date")
    private LocalDate fromDate;

    @JsonProperty("to_date")
    private LocalDate toDate;

    /** Periyot toplamı (POS profit + non-POS gross − giderler, transferler 0). */
    @JsonProperty("total_income")
    private BigDecimal totalIncome;

    @JsonProperty("tx_count")
    private int txCount;

    @JsonProperty("breakdown_by_source")
    private List<SourceBreakdown> breakdownBySource;

    @JsonProperty("by_month")
    private List<MonthlyPoint> byMonth;

    @Data
    @Builder
    public static class SourceBreakdown {
        /** COUNTERPART | POS_DEVICE | BANK_ACCOUNT */
        @JsonProperty("source_type") private String sourceType;
        @JsonProperty("source_id") private UUID sourceId;
        @JsonProperty("source_name") private String sourceName;
        @JsonProperty("tx_count") private int txCount;
        private BigDecimal income;
    }

    @Data
    @Builder
    public static class MonthlyPoint {
        /** YYYY-MM format (örn. "2026-05"). */
        private String month;
        private BigDecimal income;
        @JsonProperty("tx_count") private int txCount;
    }
}
