package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class DebtSummaryDto {

    @JsonProperty("total_receivable")
    private BigDecimal totalReceivable;

    @JsonProperty("total_payable")
    private BigDecimal totalPayable;

    @JsonProperty("net_balance")
    private BigDecimal netBalance; // receivable - payable (pozitif = net alacak)

    @JsonProperty("settled_receivable")
    private BigDecimal settledReceivable;

    @JsonProperty("settled_payable")
    private BigDecimal settledPayable;

    @JsonProperty("pending_receivable")
    private BigDecimal pendingReceivable;

    @JsonProperty("pending_payable")
    private BigDecimal pendingPayable;

    @JsonProperty("receivable_count")
    private int receivableCount;

    @JsonProperty("payable_count")
    private int payableCount;
}
