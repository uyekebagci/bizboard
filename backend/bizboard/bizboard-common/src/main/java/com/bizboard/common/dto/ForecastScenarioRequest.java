package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;

/**
 * Raporlar v1.1 (R6): What-if senaryo motoru girdisi.
 *
 * <p><b>READ-ONLY.</b> Kullanıcı parametreleri değiştirdiğinde tahmin yeniden
 * hesaplanır; hiçbir kalıcı değişiklik yapılmaz. Tüm alanlar opsiyonel — null
 * ise o parametre baz senaryo (etkisiz) kabul edilir.</p>
 *
 * <p>Yüzde alanları "delta" anlamındadır: {@code incomeDeltaPct=10} → gelir
 * tarafı %10 artırılır; {@code expenseDeltaPct=-5} → gider %5 azaltılır. Sınır
 * servis katmanında uygulanır (−100..+1000) — uçuk değerler clamp'lenir.</p>
 */
public record ForecastScenarioRequest(

        /** Gelir tarafına uygulanacak yüzde delta (ör. 10 = +%10). */
        @JsonProperty("income_delta_pct") BigDecimal incomeDeltaPct,

        /** Gider tarafına uygulanacak yüzde delta (ör. -5 = -%5). */
        @JsonProperty("expense_delta_pct") BigDecimal expenseDeltaPct,

        /** Her haftaya eklenecek sabit ek gider (TL, pozitif magnitude). */
        @JsonProperty("extra_weekly_expense") BigDecimal extraWeeklyExpense,

        /** Tek seferlik ek gider tutarı (TL, pozitif magnitude). */
        @JsonProperty("extra_one_time_expense") BigDecimal extraOneTimeExpense,

        /** Tek seferlik ek giderin düşeceği hafta (1..weeks); null → 1. hafta. */
        @JsonProperty("extra_one_time_week") Integer extraOneTimeWeek
) {
}
