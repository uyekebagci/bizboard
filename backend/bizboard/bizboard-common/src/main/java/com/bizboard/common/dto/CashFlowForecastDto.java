package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * Raporlar v1.1 (R5): 13-haftalık nakit-akış TAHMİNİ.
 *
 * <p><b>READ-ONLY analitik.</b> Mevcut ledger/kasa sayılarını DEĞİŞTİRMEZ —
 * yalnızca geçmiş hareketlerden + bilinen vadeli alacak/verecek/çek-senet'ten
 * ileriye haftalık projeksiyon üretir. Sonuç hiçbir yere kaydedilmez (what-if
 * senaryo motoru aynı yapıyı parametre değişikliği ile yeniden hesaplar).</p>
 *
 * <p>Tüm tutarlar TL ve <b>işaretli</b> (net pozitif/negatif). conventions §2
 * gereği magnitude değil net akış döner — frontend gelen/giden ayrımını
 * {@code inflow}/{@code outflow} alanlarından gösterir.</p>
 */
@Data
@Builder
public class CashFlowForecastDto {

    /** Başlangıç bakiyesi (bugünkü fiziksel kasa + banka toplamı, TL). */
    @JsonProperty("opening_balance")
    private BigDecimal openingBalance;

    /** Projeksiyon başlangıç tarihi (bugün) yyyy-MM-dd. */
    @JsonProperty("as_of")
    private String asOf;

    /** Hafta sayısı (varsayılan 13). */
    private int weeks;

    /**
     * Tahminin dayandığı haftalık baz akış: geçmiş N haftanın ortalama net
     * NAKIT akışı (NAKIT + POS; HESAPDAN/TRANSFER hariç — ClosingCalculator
     * semantiği). Şeffaflık için döner; frontend "neye göre tahmin?" gösterir.
     */
    @JsonProperty("baseline_weekly_net")
    private BigDecimal baselineWeeklyNet;

    /** Geçmiş baz akışın hesaplandığı hafta sayısı (lookback). */
    @JsonProperty("baseline_lookback_weeks")
    private int baselineLookbackWeeks;

    /** Uygulanan what-if senaryosu (null = baz senaryo). */
    @JsonProperty("scenario")
    private ScenarioEcho scenario;

    /** Haftalık projeksiyon satırları (ileriye doğru). */
    private List<WeekPoint> weeksData;

    /** Projeksiyon sonu bakiyesi (= son haftanın closingBalance'ı). */
    @JsonProperty("ending_balance")
    private BigDecimal endingBalance;

    /** Projeksiyon boyunca görülen en düşük bakiye (likidite riski göstergesi). */
    @JsonProperty("min_balance")
    private BigDecimal minBalance;

    /** En düşük bakiyenin görüldüğü hafta indeksi (1-based); yoksa 0. */
    @JsonProperty("min_balance_week")
    private int minBalanceWeek;

    /** Projeksiyon boyunca bakiye sıfırın altına düşüyor mu (nakit açığı uyarısı). */
    @JsonProperty("has_shortfall")
    private boolean hasShortfall;

    @Data
    @Builder
    public static class WeekPoint {
        /** Hafta indeksi (1..weeks). */
        private int index;

        /** Hafta başlangıç tarihi (Pazartesi) yyyy-MM-dd. */
        @JsonProperty("week_start")
        private String weekStart;

        /** Hafta bitiş tarihi (Pazar) yyyy-MM-dd. */
        @JsonProperty("week_end")
        private String weekEnd;

        /** Etiket (ör. "24 Haz – 30 Haz"). */
        private String label;

        /** Haftaya devreden açılış bakiyesi. */
        @JsonProperty("opening_balance")
        private BigDecimal openingBalance;

        /** Beklenen toplam giriş (baz akış pozitifi + vadeli alacak/çek tahsili). */
        private BigDecimal inflow;

        /** Beklenen toplam çıkış (baz akış negatifi + vadeli verecek/çek ödeme + sabit gider). */
        private BigDecimal outflow;

        /** Net akış = inflow − outflow. */
        private BigDecimal net;

        /** Hafta sonu bakiyesi = openingBalance + net. */
        @JsonProperty("closing_balance")
        private BigDecimal closingBalance;

        /** Bu haftaya düşen bilinen vadeli kalemler (drill-down şeffaflık). */
        @JsonProperty("scheduled_items")
        private List<ScheduledItem> scheduledItems;
    }

    /** Bilinen, vadesi bu haftaya düşen tek bir kalem (alacak/verecek/çek). */
    @Data
    @Builder
    public static class ScheduledItem {
        /** Tür: RECEIVABLE / PAYABLE / CHEQUE_IN / CHEQUE_OUT / FIXED_COST. */
        private String kind;

        /** Açıklama (cari adı veya kalem adı). */
        private String label;

        /** Vade tarihi yyyy-MM-dd. */
        @JsonProperty("due_date")
        private String dueDate;

        /** İşaretli tutar: giriş + / çıkış − (TL). */
        private BigDecimal amount;
    }

    /** Uygulanan what-if parametrelerinin yankısı (gösterim/teyit için). */
    @Data
    @Builder
    public static class ScenarioEcho {
        @JsonProperty("income_delta_pct")
        private BigDecimal incomeDeltaPct;

        @JsonProperty("expense_delta_pct")
        private BigDecimal expenseDeltaPct;

        @JsonProperty("extra_weekly_expense")
        private BigDecimal extraWeeklyExpense;

        @JsonProperty("extra_one_time_expense")
        private BigDecimal extraOneTimeExpense;

        @JsonProperty("extra_one_time_week")
        private Integer extraOneTimeWeek;
    }
}
