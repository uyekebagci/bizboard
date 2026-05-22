package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.7.x WP fbb2ef55: payment_instruments tablosunun DTO karşılığı.
 */
@Data
@Builder
public class PaymentInstrumentDto {
    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("counterpart_id")
    private UUID counterpartId;

    @JsonProperty("counterpart_name")
    private String counterpartName;

    @JsonProperty("instrument_type")
    private String instrumentType;

    private String direction;

    private BigDecimal amount;
    private String currency;

    @JsonProperty("issue_date")
    private LocalDate issueDate;

    @JsonProperty("due_date")
    private LocalDate dueDate;

    @JsonProperty("cheque_number")
    private String chequeNumber;

    @JsonProperty("drawer_bank")
    private String drawerBank;

    @JsonProperty("drawer_branch")
    private String drawerBranch;

    @JsonProperty("note_serial")
    private String noteSerial;

    private String status;

    @JsonProperty("cleared_at")
    private LocalDateTime clearedAt;

    @JsonProperty("cleared_bank_account_id")
    private UUID clearedBankAccountId;

    @JsonProperty("cleared_bank_account_name")
    private String clearedBankAccountName;

    @JsonProperty("bounced_at")
    private LocalDateTime bouncedAt;

    private String description;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
