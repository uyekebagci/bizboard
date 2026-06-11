package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Çatı v1.2 — Verilen/Alınan Borç oluşturma yanıtı.
 *
 * <p>İki kayıt üretir: kasa hareketi (transaction) + alacak/verecek (debt).
 * Magnitude POZİTİF (sign convention: {@code debt_direction} belirler).</p>
 */
@Data
@Builder
public class LoanResponseDto {

    /** "GIVEN" (verilen → alacak) veya "TAKEN" (alınan → verecek). */
    @JsonProperty("loan_type")
    private String loanType;

    /** Oluşturulan kasa hareketi (kind=LOAN). */
    @JsonProperty("transaction_id")
    private UUID transactionId;

    /** Oluşturulan alacak/verecek kaydı. */
    @JsonProperty("debt_id")
    private UUID debtId;

    /** "RECEIVABLE" (alacak) veya "PAYABLE" (verecek). */
    @JsonProperty("debt_direction")
    private String debtDirection;

    /** Magnitude — her zaman pozitif. */
    private BigDecimal amount;

    @JsonProperty("counterpart_id")
    private UUID counterpartId;

    private String counterparty;
}
