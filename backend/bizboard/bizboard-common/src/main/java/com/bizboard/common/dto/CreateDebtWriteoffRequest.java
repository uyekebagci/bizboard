package com.bizboard.common.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;

/**
 * WP a9da4e9d: POST /debts/{id}/writeoff body.
 */
@Data
public class CreateDebtWriteoffRequest {

    @NotNull
    @Positive
    private BigDecimal amount;

    /** Opsiyonel. Örn. "İskonto anlaşması", "Mutabakat", "Hatalı kayıt". */
    private String reason;
}
