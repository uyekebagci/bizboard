package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * v1.7.x WP fbb2ef55: POST /counterparts/{id}/payments response.
 */
@Data
@Builder
public class PaymentResponseDto {

    @JsonProperty("payment_id")
    private UUID paymentId;

    @JsonProperty("linked_transaction_id")
    private UUID linkedTransactionId;

    @JsonProperty("linked_instrument_id")
    private UUID linkedInstrumentId;

    @JsonProperty("debts_updated")
    private List<DebtUpdate> debtsUpdated;

    @JsonProperty("overpayment_created")
    private OverpaymentInfo overpaymentCreated;

    @Data
    @Builder
    public static class DebtUpdate {
        @JsonProperty("debt_id") private UUID debtId;
        @JsonProperty("remaining_after") private BigDecimal remainingAfter;
        private String status;
    }

    @Data
    @Builder
    public static class OverpaymentInfo {
        @JsonProperty("debt_id") private UUID debtId;
        private BigDecimal amount;
    }
}
