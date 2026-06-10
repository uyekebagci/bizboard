package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.5): T+1 POS yatış batch'i (gün+cihaz, ort.komisyon).
 */
@Data
@Builder
public class PosSettlementBatchDto {
    private UUID id;
    @JsonProperty("settle_date")
    private LocalDate settleDate;
    @JsonProperty("pos_device_id")
    private UUID posDeviceId;
    @JsonProperty("pos_device_name")
    private String posDeviceName;
    @JsonProperty("gross_total")
    private BigDecimal grossTotal;
    @JsonProperty("deposited_amount")
    private BigDecimal depositedAmount;
    @JsonProperty("avg_commission_rate")
    private BigDecimal avgCommissionRate;
    private boolean finalized;
    @JsonProperty("deal_count")
    private int dealCount;
    /** Yatış girilmemiş + brüt > 0 → "yatış bekliyor" (kaçak adayı). */
    @JsonProperty("pending_deposit")
    private boolean pendingDeposit;
}
