package com.bizboard.common.search;

import lombok.Builder;
import lombok.Value;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

/**
 * v2.2.0 — parse edilmiş, doğrulanmış sorgu (spec §5, §8).
 *
 * <p>Parser ham query string'i bu immutable yapıya çevirir. Tüm değerler
 * allowlist'lenmiş; raw SQL'e değil parametrelere bağlanır (T5).</p>
 *
 * <ul>
 *   <li>{@code terms} — serbest metin AND-token'ları (boşluk = AND, spec §5.1).</li>
 *   <li>{@code phrases} — tırnaklı exact phrase'ler.</li>
 *   <li>{@code orGroups} — OR ile bağlanmış alternatif term grupları.</li>
 *   <li>{@code excluded} — NOT term'leri (spec §5.2).</li>
 *   <li>field filtreleri — entity tipi, işletme adı, kategori, durum, etiket.</li>
 *   <li>{@code amountRange} / {@code dateRange} — sayısal/tarihsel aralık.</li>
 * </ul>
 */
@Value
@Builder
public class ParsedQuery {

    @Builder.Default
    List<String> terms = List.of();
    @Builder.Default
    List<String> phrases = List.of();
    @Builder.Default
    List<List<String>> orGroups = List.of();
    @Builder.Default
    List<String> excluded = List.of();

    @Builder.Default
    Set<SearchEntityType> types = Set.of();
    @Builder.Default
    List<String> businessNames = List.of();
    @Builder.Default
    List<String> categories = List.of();
    @Builder.Default
    List<String> statuses = List.of();
    @Builder.Default
    List<String> tags = List.of();

    /** Yetki gerektiren alanlar (spec §5.3 vkn/iban) — yetki yoksa eşleşme yok. */
    String taxId;
    String iban;

    Range amountRange;
    DateRange dateRange;

    /** Hiç anlamlı kriter yoksa true → boş sonuç yerine "ipuçları" göster. */
    public boolean isEmpty() {
        return terms.isEmpty() && phrases.isEmpty() && orGroups.isEmpty()
                && excluded.isEmpty() && types.isEmpty() && businessNames.isEmpty()
                && categories.isEmpty() && statuses.isEmpty() && tags.isEmpty()
                && taxId == null && iban == null && amountRange == null && dateRange == null;
    }

    /** En az bir serbest-metin (full-text) kriteri var mı? */
    public boolean hasTextCriteria() {
        return !terms.isEmpty() || !phrases.isEmpty() || !orGroups.isEmpty();
    }

    /** {@code tutar:>5000} / {@code tutar:1000..5000} (spec §5.3). */
    @Value
    public static class Range {
        BigDecimal min; // null = sınırsız alt
        BigDecimal max; // null = sınırsız üst
    }

    /** {@code tarih:2026-01} / {@code tarih:son-hafta} (spec §5.3, §5.4). */
    @Value
    public static class DateRange {
        LocalDate from; // inclusive
        LocalDate to;   // inclusive
    }
}
