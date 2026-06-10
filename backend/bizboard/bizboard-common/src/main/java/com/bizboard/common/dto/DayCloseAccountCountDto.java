package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.6): bir gün-kapanışındaki tek hesabın sayım DTO'su
 * (hem girdi hem çıktı). Girişte {@code countedBalance} zorunlu; çıkışta
 * {@code computedBalance}/{@code accountVariance} drill-down için dolu gelir.
 */
@Data
@Builder
public class DayCloseAccountCountDto {

    private UUID id;

    @JsonProperty("account_id")
    private UUID accountId;

    @JsonProperty("account_name")
    private String accountName;

    @JsonProperty("account_type")
    private String accountType;

    @JsonProperty("counted_balance")
    private BigDecimal countedBalance;

    @JsonProperty("computed_balance")
    private BigDecimal computedBalance;

    @JsonProperty("account_variance")
    private BigDecimal accountVariance;
}
