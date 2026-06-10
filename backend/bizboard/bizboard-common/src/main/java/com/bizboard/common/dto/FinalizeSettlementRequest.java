package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.5 / TODO 2) — T+1 POS yatış finalize isteği.
 * Gün kapanışında o POS cihazına banka yatışı girilir → ort.komisyon hesaplanır.
 */
@Data
public class FinalizeSettlementRequest {

    @NotNull(message = "pos_device_id zorunlu")
    @JsonProperty("pos_device_id")
    private UUID posDeviceId;

    @NotNull(message = "settle_date zorunlu (deal/brüt günü)")
    @JsonProperty("settle_date")
    private LocalDate settleDate;

    @NotNull(message = "deposited_amount zorunlu (bankaya yatan net tutar)")
    @DecimalMin(value = "0.0", message = "deposited_amount negatif olamaz")
    @JsonProperty("deposited_amount")
    private BigDecimal depositedAmount;

    /** Yatışın düştüğü banka hesabı (opsiyonel iz). */
    @JsonProperty("deposit_account_id")
    private UUID depositAccountId;
}
