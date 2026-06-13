package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Portföy günlük aktivite serisi — dashboard "Haftalık Hareket" bar-chart'ı için.
 *
 * <p>Erişilebilir TÜM işletmelerin toplamı, son N gün GÜN BAZINDA. Her gün için
 * gelir/gider/net döner. Net hesabı {@code PosIncomeCalculator} ile yapılır
 * (TRANSFER/LOAN dışlanır, POS tam tutar) — böylece konsolide net ve dönem
 * özetiyle TUTARLI. Salt-okunur, additive endpoint; mevcut hesap yollarını
 * DEĞİŞTİRMEZ.</p>
 *
 * <p>Magnitude konvansiyonu (docs/conventions.md §2): {@code income} ve
 * {@code expense} her zaman POZİTİF magnitude. {@code net} işaretli
 * (gelir − gider; negatif olabilir).</p>
 */
@Data
@Builder
public class PortfolioActivityDto {

    /** Seri başlangıcı (dahil). */
    @JsonProperty("from")
    private LocalDate from;

    /** Seri sonu (dahil) — genelde bugün. */
    @JsonProperty("to")
    private LocalDate to;

    /** Erişilebilir işletme sayısı (0 → boş seri, nötr durum). */
    @JsonProperty("business_count")
    private int businessCount;

    /** Gün bazında değerler (kronolojik artan: eski → yeni). */
    @JsonProperty("days")
    private List<DayPoint> days;

    @Data
    @Builder
    public static class DayPoint {
        @JsonProperty("date")
        private LocalDate date;

        /** Günlük toplam gelir — pozitif magnitude. */
        @JsonProperty("income")
        private BigDecimal income;

        /** Günlük toplam gider — pozitif magnitude (DISPLAY: negatif göster). */
        @JsonProperty("expense")
        private BigDecimal expense;

        /** Günlük net (gelir − gider) — işaretli. */
        @JsonProperty("net")
        private BigDecimal net;
    }
}
