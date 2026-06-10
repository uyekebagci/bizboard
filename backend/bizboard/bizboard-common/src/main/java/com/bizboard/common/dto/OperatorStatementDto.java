package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.11 / TODO 7) — operatör kâr-merkezi READ-ONLY statement.
 *
 * <p>Biriken kâr posting'leri ({@code source=auto}) + operatöre ödemeler +
 * güncel bakiye. CRUD yok, sadece görüntü + drill-down.</p>
 * <pre>
 *   bakiye = Σ(otomatik kâr payı) − Σ(operatöre ödeme)
 * </pre>
 */
@Data
@Builder
public class OperatorStatementDto {

    @JsonProperty("account_id")
    private UUID accountId;
    @JsonProperty("account_name")
    private String accountName;
    @JsonProperty("operator_counterpart_id")
    private UUID operatorCounterpartId;
    @JsonProperty("operator_name")
    private String operatorName;

    /** Σ biriken kâr (PROFIT_SHARE giriş, +). */
    @JsonProperty("total_earned")
    private BigDecimal totalEarned;
    /** Σ operatöre ödeme (çıkış, +olarak). */
    @JsonProperty("total_paid_out")
    private BigDecimal totalPaidOut;
    /** Güncel bakiye = earned − paidOut (= Σ posting). */
    private BigDecimal balance;
    /** Henüz kesinleşmemiş (provisional) kâr — T+1 bekleyen. */
    @JsonProperty("provisional_pending")
    private BigDecimal provisionalPending;

    private List<StatementLine> lines;

    @Data
    @Builder
    public static class StatementLine {
        @JsonProperty("posting_id")
        private UUID postingId;
        @JsonProperty("journal_entry_id")
        private UUID journalEntryId;
        private LocalDate date;
        @JsonProperty("source_type")
        private String sourceType;
        private String description;
        /** + = kâr girişi, − = ödeme çıkışı. */
        private BigDecimal amount;
        private boolean provisional;
    }
}
