package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Portföy dönem-karşılaştırması — dashboard MetricCard delta yüzdeleri için.
 *
 * <p>Seçili dönemin gelir/gider/net toplamı, ÖNCEKİ eşdeğer dönemle (aynı uzunluk,
 * hemen önce) karşılaştırılır. Her metrik için yüzde değişim ({@code delta_pct})
 * döner. Önceki dönem 0 ise delta {@code null} (tanımsız — FE delta'yı gizler,
 * uydurma yüzde göstermez).</p>
 *
 * <p>Net hesabı erişilebilir işletmeler toplamı, {@code PosIncomeCalculator} ile
 * (TRANSFER/LOAN dışlanır) — konsolide net ile TUTARLI. Salt-okunur, additive;
 * mevcut consolidated/portfolio hesabını DEĞİŞTİRMEZ.</p>
 */
@Data
@Builder
public class PortfolioComparisonDto {

    /** Çözümlenen periyot etiketi (daily/weekly/monthly/quarterly/yearly/custom). */
    @JsonProperty("period")
    private String period;

    /** Seçili dönem (current). */
    @JsonProperty("current")
    private Window current;

    /** Önceki eşdeğer dönem (previous). */
    @JsonProperty("previous")
    private Window previous;

    /** Erişilebilir işletme sayısı (0 → tüm değerler 0, delta null). */
    @JsonProperty("business_count")
    private int businessCount;

    /** Gelir yüzde değişimi (current vs previous). Önceki 0 → null. */
    @JsonProperty("income_delta_pct")
    private BigDecimal incomeDeltaPct;

    /** Gider yüzde değişimi. Önceki 0 → null. */
    @JsonProperty("expense_delta_pct")
    private BigDecimal expenseDeltaPct;

    /** Net yüzde değişimi. Önceki 0 → null. */
    @JsonProperty("net_delta_pct")
    private BigDecimal netDeltaPct;

    @Data
    @Builder
    public static class Window {
        @JsonProperty("from")
        private LocalDate from;

        @JsonProperty("to")
        private LocalDate to;

        /** Toplam gelir — pozitif magnitude. */
        @JsonProperty("income")
        private BigDecimal income;

        /** Toplam gider — pozitif magnitude. */
        @JsonProperty("expense")
        private BigDecimal expense;

        /** Net (gelir − gider) — işaretli. */
        @JsonProperty("net")
        private BigDecimal net;
    }
}
