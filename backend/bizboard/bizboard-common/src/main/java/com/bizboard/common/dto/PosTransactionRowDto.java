package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.3: günlük POS işlemleri tablosu için satır DTO.
 */
@Data
@Builder
public class PosTransactionRowDto {

    @JsonProperty("tx_id")
    private UUID txId;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    /** Brüt tutar (kullanıcının yazdığı). */
    private BigDecimal amount;

    @JsonProperty("pos_rate")
    private BigDecimal posRate;

    /** Banka komisyonu (amount * pos_rate / 100). */
    @JsonProperty("pos_commission")
    private BigDecimal posCommission;

    /** Net tutar (amount - pos_commission). */
    @JsonProperty("net_amount")
    private BigDecimal netAmount;

    private String description;

    /** İşlem zamanı (createdAt). */
    private LocalDateTime time;
}
