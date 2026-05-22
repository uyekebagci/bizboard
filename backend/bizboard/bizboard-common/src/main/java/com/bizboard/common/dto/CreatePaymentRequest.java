package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * v1.7.x WP fbb2ef55: POST /counterparts/{id}/payments body.
 *
 * <p>4 ödeme yöntemini de destekler: NAKIT, HESAPDAN, CHEQUE, PROMISSORY_NOTE.
 * Method'a göre nested object zorunludur (cheque_details / note_details).</p>
 */
@Data
public class CreatePaymentRequest {

    /** RECEIVED (alacak tahsili) | PAID (verecek ödemesi) */
    @NotBlank
    @JsonProperty("payment_direction")
    private String paymentDirection;

    /** NAKIT | HESAPDAN | CHEQUE | PROMISSORY_NOTE */
    @NotBlank
    @JsonProperty("payment_method")
    private String paymentMethod;

    @NotNull
    @Positive
    private BigDecimal amount;

    @NotNull
    @JsonProperty("payment_date")
    private LocalDate paymentDate;

    /** HESAPDAN için zorunlu. */
    @JsonProperty("bank_account_id")
    private UUID bankAccountId;

    /** CHEQUE için zorunlu. */
    @JsonProperty("cheque_details")
    private ChequeDetails chequeDetails;

    /** PROMISSORY_NOTE için zorunlu. */
    @JsonProperty("note_details")
    private NoteDetails noteDetails;

    /** Opsiyonel — verilmezse FIFO. */
    private List<Allocation> allocations;

    private String description;

    @Data
    public static class ChequeDetails {
        @JsonProperty("cheque_number")
        private String chequeNumber;
        @JsonProperty("drawer_bank")
        private String drawerBank;
        @JsonProperty("drawer_branch")
        private String drawerBranch;
        @JsonProperty("due_date")
        private LocalDate dueDate;
    }

    @Data
    public static class NoteDetails {
        @JsonProperty("note_serial")
        private String noteSerial;
        @JsonProperty("due_date")
        private LocalDate dueDate;
    }

    @Data
    public static class Allocation {
        @JsonProperty("debt_id")
        private UUID debtId;
        private BigDecimal amount;
    }
}
