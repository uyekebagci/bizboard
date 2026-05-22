package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * v1.7.0-beta (Bankalar WP TODO abb90050): POST /transfers body.
 *
 * <p>{@code business_id} JWT'den çözülür — body'de YOK (multi-tenant
 * doğrulama + actor accessibility üzerinden). {@code category_id} de
 * YOK — transfer category boyutu taşımaz.</p>
 */
@Data
public class CreateTransferRequest {

    @NotNull
    @JsonProperty("from_bank_account_id")
    private UUID fromBankAccountId;

    @NotNull
    @JsonProperty("to_bank_account_id")
    private UUID toBankAccountId;

    @NotNull
    @Positive
    private BigDecimal amount;

    @NotNull
    private LocalDate date;

    /** Opsiyonel — iki tx'in de description'ı aynı olur. */
    private String description;
}
