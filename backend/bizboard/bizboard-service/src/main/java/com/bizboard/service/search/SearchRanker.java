package com.bizboard.service.search;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * v2.2.0 — uygulama katmanı re-rank skoru (spec §6.4).
 *
 * <ul>
 *   <li>Exact match boost: ×2</li>
 *   <li>Prefix match boost: ×1.5</li>
 *   <li>Baseline (substring match): ×1</li>
 *   <li>Recency boost: {@code 1.0 / (1.0 + days_old / 365)}</li>
 * </ul>
 */
public final class SearchRanker {

    private SearchRanker() {}

    /**
     * @param title    eşleşen ana alan (örn. işlem açıklaması, cari adı)
     * @param terms    sorgudaki serbest-metin kelimeleri (lowercase karşılaştırılır)
     * @param date     entity tarihi (recency için); null → recency nötr
     * @param today    bağlam tarihi
     */
    public static double score(String title, List<String> terms, LocalDate date, LocalDate today) {
        double base = 1.0;
        if (title != null && terms != null && !terms.isEmpty()) {
            String lower = title.toLowerCase();
            String first = terms.get(0).toLowerCase();
            if (lower.equals(first)) {
                base = 2.0;
            } else if (lower.startsWith(first)) {
                base = 1.5;
            }
        }
        double recency = 1.0;
        if (date != null && today != null) {
            long daysOld = Math.max(0, ChronoUnit.DAYS.between(date, today));
            recency = 1.0 / (1.0 + (daysOld / 365.0));
        }
        return base * recency;
    }
}
