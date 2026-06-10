package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §4): gün-kapanışı finalize body — çok-hesaplı zorunlu sayım.
 *
 * <p>{@code closeDate} null = bugün; geçmiş tarih = backdated (admin + flag).
 * {@code accountCounts} her parası-olan hesap için sayım. {@code varianceThreshold}
 * opsiyonel (verilmezse business default eşiği).</p>
 */
@Data
public class CloseDayRequest {

    /** Null = bugün. Geçmiş tarih → backdated akış (admin + feature flag, §4.1). */
    @JsonProperty("close_date")
    private LocalDate closeDate;

    /** Her parası-olan hesabın gerçek (sayılan) bakiyesi — ZORUNLU. */
    @NotNull
    @Valid
    @JsonProperty("account_counts")
    private List<AccountCountInput> accountCounts;

    @JsonProperty("variance_threshold")
    private BigDecimal varianceThreshold;

    /** LOSS / MIS_ENTRY / ROUNDING / OTHER. */
    @JsonProperty("reason_category")
    private String reasonCategory;

    @JsonProperty("reason_note")
    private String reasonNote;

    /** Mevcut CLOSED kaydın üstüne yaz (backdated/override). Default false. */
    private Boolean override;

    @Data
    public static class AccountCountInput {
        @NotNull
        @JsonProperty("account_id")
        private UUID accountId;

        @NotNull
        @JsonProperty("counted_balance")
        private BigDecimal countedBalance;
    }
}
