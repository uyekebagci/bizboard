package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §4 madde 5): kaçak drill-down — variance'ın kaynağına in.
 *
 * <p>Hesap-bazlı sapma ({@code accountBreakdown}) + o günün hesap hareketleri
 * ({@code movements}) → "hangi hesap saptı, hangi işlem eksik?" cevabı.</p>
 */
@Data
@Builder
public class DayCloseDrillDownDto {

    @JsonProperty("close_date")
    private LocalDate closeDate;

    @JsonProperty("opening_balance")
    private BigDecimal openingBalance;

    @JsonProperty("total_in")
    private BigDecimal totalIn;

    @JsonProperty("total_out")
    private BigDecimal totalOut;

    @JsonProperty("computed_closing")
    private BigDecimal computedClosing;

    @JsonProperty("actual_total")
    private BigDecimal actualTotal;

    private BigDecimal variance;

    /** Hesap bazında sapma (counted − computed); en saptıran ilk. */
    @JsonProperty("account_breakdown")
    private List<DayCloseAccountCountDto> accountBreakdown;

    /** O günün konum hareketleri (kaçak adayı işlemler). */
    private List<Movement> movements;

    @Data
    @Builder
    public static class Movement {
        @JsonProperty("posting_id")
        private UUID postingId;

        @JsonProperty("journal_entry_id")
        private UUID journalEntryId;

        @JsonProperty("account_id")
        private UUID accountId;

        @JsonProperty("account_name")
        private String accountName;

        private BigDecimal amount;

        @JsonProperty("source_type")
        private String sourceType;

        private String description;
    }
}
