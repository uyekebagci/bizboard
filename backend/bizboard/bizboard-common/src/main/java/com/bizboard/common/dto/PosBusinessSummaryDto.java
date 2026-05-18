package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.3: bir işletmenin POS işlem özeti (POS sayfası kart görünümü için).
 */
@Data
@Builder
public class PosBusinessSummaryDto {

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    /** Toplam POS işlem sayısı. */
    @JsonProperty("total_pos_count")
    private int totalPosCount;

    /** Brüt toplam tutar (komisyon kesilmemiş). */
    @JsonProperty("total_pos_amount")
    private BigDecimal totalPosAmount;

    /** Ağırlıklı ortalama POS komisyon oranı (yüzde). */
    @JsonProperty("avg_pos_rate")
    private BigDecimal avgPosRate;

    /** Son POS işleminin createdAt'i. */
    @JsonProperty("last_tx_at")
    private LocalDateTime lastTxAt;
}
