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

    /**
     * WP a9da4e9d (Beta v1.1): Borç silme kayıtları — ödeme almadan
     * manuel düşümler. Tx tabanlı raporlar etkilenmez; yalnız cari
     * hesap balance'ı düşer ve burada listelenir.
     */
    @JsonProperty("writeoffs")
    private List<DebtWriteoffDto> writeoffs;

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
        /** v1.7.0.x (WP a9da4e9d): bu counterpart için toplam silme tutarı (info). */
        @JsonProperty("total_writeoffs_amount") private BigDecimal totalWriteoffsAmount;
    }

    @Data
    @Builder
    public static class OpenDebt {
        private UUID id;
        private String direction;
        /** GÜNCEL kurla TL tam tutar (totals/ödeme baz alır — geriye uyumlu). */
        @JsonProperty("original_amount") private BigDecimal originalAmount;
        /** GÜNCEL kurla TL kalan tutar (totals/ödeme baz alır — geriye uyumlu). */
        @JsonProperty("remaining_amount") private BigDecimal remainingAmount;
        /**
         * WP currency-display: borcun orijinal para birimi (TRY/USD/GOLD).
         * Gösterim için — USD borç "$40.000", GOLD gram/kg gösterilir; TL toplama
         * çevrilmiş {@link #originalAmount} eklenmeye devam eder.
         */
        private String currency;
        /** WP currency-display: orijinal cinsindeki tam tutar (USD adedi / gram altın). */
        @JsonProperty("original_currency_amount") private BigDecimal originalCurrencyAmount;
        /**
         * WP currency-display: orijinal cinsindeki kalan tutar. remaining/amount
         * oranı korunarak {@code originalCurrencyAmount}'tan türetilir.
         */
        @JsonProperty("remaining_currency_amount") private BigDecimal remainingCurrencyAmount;
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
        /** DEBT_CREATED | PAYMENT | INSTRUMENT_CLEARED | INSTRUMENT_BOUNCED | TRANSACTION | WRITEOFF */
        private String type;
        private BigDecimal amount;            // pozitif: alacak yönü; negatif: verecek yönü
        @JsonProperty("balance_after") private BigDecimal balanceAfter;
        @JsonProperty("reference_id") private UUID referenceId;
        private String description;
    }
}
