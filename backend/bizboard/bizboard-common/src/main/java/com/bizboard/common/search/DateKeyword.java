package com.bizboard.common.search;

import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Optional;

/**
 * v2.2.0 — Türkçe tarih anahtar kelimeleri (spec §5.4) → {@link ParsedQuery.DateRange}.
 *
 * <p>Bağlam tarihi (genelde {@code LocalDate.now()}) dışarıdan verilir; böylece
 * deterministik unit test yazılabilir.</p>
 */
public final class DateKeyword {

    private DateKeyword() {}

    public static Optional<ParsedQuery.DateRange> resolve(String keyword, LocalDate today) {
        if (keyword == null) return Optional.empty();
        String k = keyword.trim().toLowerCase();
        return switch (k) {
            case "bugun", "bugün" -> Optional.of(range(today, today));
            case "dun", "dün" -> {
                LocalDate y = today.minusDays(1);
                yield Optional.of(range(y, y));
            }
            case "son-hafta" -> Optional.of(range(today.minusDays(7), today));
            case "son-ay" -> Optional.of(range(today.minusMonths(1), today));
            case "son-yil", "son-yıl" -> Optional.of(range(today.minusYears(1), today));
            case "bu-hafta" -> Optional.of(range(
                    today.with(TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY)), today));
            case "bu-ay" -> Optional.of(range(today.withDayOfMonth(1), today));
            case "bu-yil", "bu-yıl" -> Optional.of(range(today.withDayOfYear(1), today));
            case "gecen-hafta", "geçen-hafta" -> {
                LocalDate startThis = today.with(TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY));
                yield Optional.of(range(startThis.minusDays(7), startThis.minusDays(1)));
            }
            case "gecen-ay", "geçen-ay" -> {
                LocalDate firstThis = today.withDayOfMonth(1);
                LocalDate firstPrev = firstThis.minusMonths(1);
                yield Optional.of(range(firstPrev, firstThis.minusDays(1)));
            }
            case "gecen-yil", "geçen-yıl" -> {
                LocalDate firstThis = today.withDayOfYear(1);
                LocalDate firstPrev = firstThis.minusYears(1);
                yield Optional.of(range(firstPrev, firstThis.minusDays(1)));
            }
            default -> Optional.empty();
        };
    }

    private static ParsedQuery.DateRange range(LocalDate from, LocalDate to) {
        return new ParsedQuery.DateRange(from, to);
    }
}
