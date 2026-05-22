package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * v1.7.x WP fbb2ef55: GET /counterparts/{id}/account-statement response.
 *
 * <p>UI tek endpoint ile counterpart detay sayfasını besler:
 * cari bakiye + breakdown + açık borçlar + ödeme geçmişi + portföy + tx geçmişi
 * + chronological running balance.</p>
 */
@Data
@Builder
public class AccountStatementDto {

    private CounterpartSummary counterpart;

    @JsonProperty("current_balance")
    private BigDecimal currentBalance;

    @JsonProperty("balance_breakdown")
    private BalanceBreakdown balanceBreakdown;

    @JsonProperty("open_debts")
    private List<OpenDebt> openDebts;

    @JsonProperty("payment_history")
    private List<PaymentHistoryItem> paymentHistory;

    @JsonProperty("instruments_portfolio")
    private List<PaymentInstrumentDto> instrumentsPortfolio;

    private List<TransactionDto> transactions;

    @JsonProperty("running_balance_history")
    private List<RunningBalanceEntry> runningBalanceHistory;

    @Data
    @Builder
    public static class CounterpartSummary {
        private UUID id;
        private String name;
        private String kind;
        private String role;
        @JsonProperty("tax_id") private String taxId;
    }

    @Data
    @Builder
    public static class BalanceBreakdown {
        @JsonProperty("open_receivables_total") private BigDecimal openReceivablesTotal;
        @JsonProperty("open_payables_total") private BigDecimal openPayablesTotal;
        @JsonProperty("portfolio_cheques_incoming") private BigDecimal portfolioChequesIncoming;
        @JsonProperty("portfolio_cheques_outgoing") private BigDecimal portfolioChequesOutgoing;
        @JsonProperty("portfolio_notes_incoming") private BigDecimal portfolioNotesIncoming;
        @JsonProperty("portfolio_notes_outgoing") private BigDecimal portfolioNotesOutgoing;
        @JsonProperty("net_realized") private BigDecimal netRealized;
        @JsonProperty("net_with_portfolio") private BigDecimal netWithPortfolio;
    }

    @Data
    @Builder
    public static class OpenDebt {
        private UUID id;
        private String direction;
        @JsonProperty("original_amount") private BigDecimal originalAmount;
        @JsonProperty("remaining_amount") private BigDecimal remainingAmount;
        private String status;
        @JsonProperty("due_date") private LocalDate dueDate;
        private String description;
        @JsonProperty("created_at") private LocalDateTime createdAt;
    }

    @Data
    @Builder
    public static class PaymentHistoryItem {
        private UUID id;
        @JsonProperty("payment_direction") private String paymentDirection;
        @JsonProperty("payment_method") private String paymentMethod;
        private BigDecimal amount;
        @JsonProperty("payment_date") private LocalDate paymentDate;
        @JsonProperty("linked_transaction_id") private UUID linkedTransactionId;
        @JsonProperty("linked_instrument_id") private UUID linkedInstrumentId;
        @JsonProperty("debt_id") private UUID debtId;
        private String description;
        @JsonProperty("created_at") private LocalDateTime createdAt;
    }

    @Data
    @Builder
    public static class RunningBalanceEntry {
        private LocalDateTime date;
        /** DEBT_CREATED | PAYMENT | INSTRUMENT_CLEARED | INSTRUMENT_BOUNCED | TRANSACTION */
        private String type;
        private BigDecimal amount;            // pozitif: alacak yönü; negatif: verecek yönü
        @JsonProperty("balance_after") private BigDecimal balanceAfter;
        @JsonProperty("reference_id") private UUID referenceId;
        private String description;
    }
}
