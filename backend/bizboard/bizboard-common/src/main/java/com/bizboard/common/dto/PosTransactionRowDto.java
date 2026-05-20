package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.3: günlük POS işlemleri tablosu için satır DTO.
 *
 * <p><b>v1.6.23.7:</b> Frontend ({@code PosTransactionRow}) ile JSON field
 * isimleri hizalandı: {@code tx_id}→{@code transaction_id},
 * {@code pos_commission}→{@code commission}, {@code net_amount}→{@code net},
 * {@code time}→{@code date}. Java field isimleri korundu (builder uyumu).</p>
 */
@Data
@Builder
public class PosTransactionRowDto {

    @JsonProperty("transaction_id")
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
    @JsonProperty("commission")
    private BigDecimal posCommission;

    /** Net tutar (amount - pos_commission). */
    @JsonProperty("net")
    private BigDecimal netAmount;

    private String description;

    /** İşlem zamanı (createdAt). */
    @JsonProperty("date")
    private LocalDateTime time;
}
