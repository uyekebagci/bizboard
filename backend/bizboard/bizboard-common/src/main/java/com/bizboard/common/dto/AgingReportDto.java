package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * WP 4c75e95c (R3): Alacak/Verecek Yaşlandırma (Aging) raporu.
 *
 * <p>Vade tarihine göre bucket'lara dağıtılır: 0-30 / 30-60 / 60-90 / 90+ gün
 * (referans = bugün), vadesiz ayrı grup. USD/GOLD tutarlar GÜNCEL kurla TL'ye
 * çevrilir (DebtAmountConverter). RECEIVABLE/PAYABLE ayrı; cari bazlı satırlar.
 * Tüm tutarlar TL ve magnitude pozitif (DGR perspektifi display'de).</p>
 */
@Data
@Builder
public class AgingReportDto {

    @JsonProperty("as_of")
    private String asOf; // referans tarih (bugün) yyyy-MM-dd

    /** Alacaklar (RECEIVABLE) yaşlandırması. */
    private AgingSection receivables;

    /** Verecekler (PAYABLE) yaşlandırması. */
    private AgingSection payables;

    @Data
    @Builder
    public static class AgingSection {
        /** Toplam (tüm bucket'lar) TL. */
        private BigDecimal total;

        @JsonProperty("bucket_0_30")
        private BigDecimal bucket0to30;
        @JsonProperty("bucket_30_60")
        private BigDecimal bucket30to60;
        @JsonProperty("bucket_60_90")
        private BigDecimal bucket60to90;
        @JsonProperty("bucket_90_plus")
        private BigDecimal bucket90plus;
        /** Vadesi olmayan (due_date null) açık borçlar. */
        @JsonProperty("no_due_date")
        private BigDecimal noDueDate;

        /** Cari bazlı satırlar. */
        private List<AgingRow> rows;
    }

    @Data
    @Builder
    public static class AgingRow {
        @JsonProperty("counterpart_name")
        private String counterpartName;

        /** Bu carinin toplam açık tutarı (TL, güncel kur). */
        private BigDecimal total;

        @JsonProperty("bucket_0_30")
        private BigDecimal bucket0to30;
        @JsonProperty("bucket_30_60")
        private BigDecimal bucket30to60;
        @JsonProperty("bucket_60_90")
        private BigDecimal bucket60to90;
        @JsonProperty("bucket_90_plus")
        private BigDecimal bucket90plus;
        @JsonProperty("no_due_date")
        private BigDecimal noDueDate;
    }
}
