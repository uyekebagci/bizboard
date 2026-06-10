package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §3.7) — çek/senet tahsil/ödeme isteği.
 *
 * <p>RECEIVED → seçilen para hesabına giriş; GIVEN → seçilen para hesabından
 * çıkış. Dengeli (Σ=0) posting yazılır.</p>
 */
@Data
public class CashInstrumentRequest {

    /** Tahsil/ödemenin yapılacağı para hesabı (BankAccount). */
    @NotNull(message = "account_id (para hesabı) zorunlu")
    @JsonProperty("account_id")
    private UUID accountId;

    /** Tahsil/ödeme tarihi — null = bugün. */
    @JsonProperty("cashed_date")
    private LocalDate cashedDate;
}
