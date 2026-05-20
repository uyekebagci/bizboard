package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.3: bir işletmenin POS işlem özeti (POS sayfası kart görünümü için).
 *
 * <p><b>v1.6.23.7:</b> Frontend ({@code PosBusinessSummary}) ile JSON field
 * isimleri hizalandı; eksik field'lar eklendi (commission, net, currency).
 * Önceki sürümde {@code total_pos_amount}, {@code total_pos_count},
 * {@code avg_pos_rate} idi; frontend {@code total_gross}, {@code transaction_count},
 * {@code weighted_avg_rate} bekliyordu → tüm field'lar undefined geliyordu,
 * sayfa boş veya hatalı render. Java field isimleri korundu (builder uyumu),
 * yalnız {@code @JsonProperty} annotation'ları güncellendi.</p>
 */
@Data
@Builder
public class PosBusinessSummaryDto {

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    /** Para birimi (default TRY). */
    private String currency;

    /** Toplam POS işlem sayısı. */
    @JsonProperty("transaction_count")
    private int totalPosCount;

    /** Brüt toplam tutar (komisyon kesilmemiş). */
    @JsonProperty("total_gross")
    private BigDecimal totalPosAmount;

    /** Toplam komisyon (SUM amount × pos_rate / 100). */
    @JsonProperty("total_commission")
    private BigDecimal totalCommission;

    /** Net toplam (total_gross - total_commission). */
    @JsonProperty("total_net")
    private BigDecimal totalNet;

    /** Ağırlıklı ortalama POS komisyon oranı (yüzde). */
    @JsonProperty("weighted_avg_rate")
    private BigDecimal avgPosRate;

    /** Son POS işleminin createdAt'i. */
    @JsonProperty("last_tx_at")
    private LocalDateTime lastTxAt;
}
