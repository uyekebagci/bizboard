package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * v1.6.21 (WP-4): POS analytics cevap DTO'su.
 *
 * <p>{@code GET /pos-devices/analytics?from=&to=&deviceId=opsiyonel}</p>
 *
 * <p>Gün-gün toplam: çekim, komisyon, net, settled / unsettled count.</p>
 */
@Data
@Builder
public class PosAnalyticsDto {

    /** Verilen filtre. */
    private LocalDate from;
    private LocalDate to;
    @JsonProperty("device_id")
    private java.util.UUID deviceId;

    /** Gün başına kırılım. */
    private List<DailyPoint> series;

    /** Toplam — series'in agregasyonu. */
    private Totals totals;

    @Data @Builder
    public static class DailyPoint {
        private LocalDate date;
        @JsonProperty("gross")      private BigDecimal gross;
        @JsonProperty("commission") private BigDecimal commission;
        @JsonProperty("net")        private BigDecimal net;
        @JsonProperty("tx_count")        private int txCount;
        @JsonProperty("settled_count")   private int settledCount;
        @JsonProperty("unsettled_count") private int unsettledCount;
    }

    @Data @Builder
    public static class Totals {
        private BigDecimal gross;
        private BigDecimal commission;
        private BigDecimal net;
        @JsonProperty("tx_count")        private int txCount;
        @JsonProperty("settled_count")   private int settledCount;
        @JsonProperty("unsettled_count") private int unsettledCount;
    }
}
