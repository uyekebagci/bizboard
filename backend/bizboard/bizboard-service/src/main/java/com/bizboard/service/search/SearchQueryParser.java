package com.bizboard.service.search;

import com.bizboard.common.search.DateKeyword;
import com.bizboard.common.search.ParsedQuery;
import com.bizboard.common.search.SearchEntityType;
import com.bizboard.common.search.SearchField;
import com.bizboard.common.search.SearchQueryException;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * v2.2.0 Advanced Search — query parser (spec §5).
 *
 * <p>Ham query string'i {@link ParsedQuery}'ye çevirir. <b>Güvenlik (T5):</b>
 * yalnız {@link SearchField} allowlist'indeki field'lar kabul edilir; tanınmayan
 * field → {@link SearchQueryException} (400). Hiçbir değer SQL'e interpolate
 * edilmez — yalnız yapısal model üretilir, sorgu katmanı parametre bağlar.</p>
 *
 * <p>Desteklenen syntax:</p>
 * <ul>
 *   <li>serbest term'ler (boşluk = AND)</li>
 *   <li>{@code "tırnaklı phrase"}</li>
 *   <li>{@code AND} / {@code OR} / {@code NOT} (+ {@code -term} kısayolu)</li>
 *   <li>{@code field:value} — allowlist'li</li>
 *   <li>aralık: {@code tutar:>5000}, {@code tutar:1000..5000}</li>
 *   <li>tarih: {@code tarih:2026-01}, {@code tarih:son-ay}, {@code tarih:2026-01..2026-03}</li>
 * </ul>
 */
@Component
public class SearchQueryParser {

    /** Token regex: tırnaklı phrase, field:"value", field:value, ya da düz kelime. */
    private static final Pattern TOKEN = Pattern.compile(
            "\"[^\"]*\"" +                       // "phrase"
            "|[A-Za-zÇĞİÖŞÜçğıöşü_]+:\"[^\"]*\"" + // field:"quoted value"
            "|[A-Za-zÇĞİÖŞÜçğıöşü_]+:[^\\s]+" +     // field:value
            "|[^\\s]+");                            // bare word

    private static final int MAX_QUERY_LEN = 512;
    private static final int MAX_TOKENS = 64;

    public ParsedQuery parse(String raw) {
        return parse(raw, LocalDate.now());
    }

    /** Test edilebilir overload: bağlam tarihi enjekte edilir. */
    public ParsedQuery parse(String raw, LocalDate today) {
        ParsedQuery.ParsedQueryBuilder b = ParsedQuery.builder();
        if (raw == null || raw.isBlank()) return b.build();
        if (raw.length() > MAX_QUERY_LEN) {
            throw new SearchQueryException("Arama sorgusu çok uzun (en fazla " + MAX_QUERY_LEN + " karakter).");
        }

        List<String> terms = new ArrayList<>();
        List<String> phrases = new ArrayList<>();
        List<String> excluded = new ArrayList<>();
        List<List<String>> orGroups = new ArrayList<>();
        Set<SearchEntityType> types = new LinkedHashSet<>();
        List<String> businessNames = new ArrayList<>();
        List<String> categories = new ArrayList<>();
        List<String> statuses = new ArrayList<>();
        List<String> tags = new ArrayList<>();
        String[] sensitive = new String[2]; // [0]=taxId [1]=iban
        ParsedQuery.Range[] amount = new ParsedQuery.Range[1];
        ParsedQuery.DateRange[] date = new ParsedQuery.DateRange[1];

        List<String> tokens = tokenize(raw);
        boolean orPending = false; // önceki token OR ise sonraki term OR-grubuna eklenir

        for (int i = 0; i < tokens.size(); i++) {
            String tok = tokens.get(i);

            // Boolean operatörler (case-insensitive, sadece üst-seviye).
            if (tok.equalsIgnoreCase("AND")) { orPending = false; continue; }
            if (tok.equalsIgnoreCase("OR")) { orPending = true; continue; }
            if (tok.equalsIgnoreCase("NOT")) {
                if (i + 1 < tokens.size()) {
                    excluded.add(stripQuotes(tokens.get(++i)));
                }
                continue;
            }
            // Parantez şu an semantik olarak düzleştirilir (gruplama gevşek desteklenir).
            tok = tok.replace("(", "").replace(")", "");
            if (tok.isBlank()) continue;

            // -term → NOT kısayolu
            if (tok.startsWith("-") && tok.length() > 1 && !tok.contains(":")) {
                excluded.add(stripQuotes(tok.substring(1)));
                continue;
            }

            int colon = fieldColonIndex(tok);
            if (colon > 0) {
                String fieldToken = tok.substring(0, colon);
                String value = stripQuotes(tok.substring(colon + 1));
                applyField(fieldToken, value, today, types, businessNames, categories,
                        statuses, tags, sensitive, amount, date);
                orPending = false;
                continue;
            }

            // Serbest term / phrase
            if (tok.startsWith("\"") && tok.endsWith("\"")) {
                String phrase = stripQuotes(tok);
                if (!phrase.isBlank()) phrases.add(phrase);
                orPending = false;
            } else if (orPending && !terms.isEmpty()) {
                // OR grubu: son term ile bunu alternatif yap.
                String prev = terms.remove(terms.size() - 1);
                orGroups.add(List.of(prev, tok));
                orPending = false;
            } else if (orPending && !orGroups.isEmpty()) {
                List<String> last = new ArrayList<>(orGroups.remove(orGroups.size() - 1));
                last.add(tok);
                orGroups.add(last);
                orPending = false;
            } else {
                terms.add(tok);
            }
        }

        return b.terms(List.copyOf(terms))
                .phrases(List.copyOf(phrases))
                .orGroups(List.copyOf(orGroups))
                .excluded(List.copyOf(excluded))
                .types(Set.copyOf(types))
                .businessNames(List.copyOf(businessNames))
                .categories(List.copyOf(categories))
                .statuses(List.copyOf(statuses))
                .tags(List.copyOf(tags))
                .taxId(sensitive[0])
                .iban(sensitive[1])
                .amountRange(amount[0])
                .dateRange(date[0])
                .build();
    }

    // ── field uygulama ──────────────────────────────────────────────────────

    private void applyField(String fieldToken, String value, LocalDate today,
                            Set<SearchEntityType> types, List<String> businessNames,
                            List<String> categories, List<String> statuses, List<String> tags,
                            String[] sensitive, ParsedQuery.Range[] amount,
                            ParsedQuery.DateRange[] date) {
        SearchField field = SearchField.fromToken(fieldToken)
                .orElseThrow(() -> new SearchQueryException(
                        "Bilinmeyen alan '" + fieldToken + "'. Tanınan alanlar: "
                                + SearchField.knownTokens() + "."));
        if (value.isBlank()) return;
        switch (field) {
            case TYPE -> SearchEntityType.fromAlias(value).ifPresentOrElse(types::add, () -> {
                throw new SearchQueryException("Bilinmeyen tip '" + value + "'.");
            });
            case BUSINESS -> businessNames.add(value);
            case CATEGORY -> categories.add(value);
            case STATUS -> statuses.add(value.toLowerCase());
            case TAG -> tags.add(value);
            case TAX_ID -> sensitive[0] = value;
            case IBAN -> sensitive[1] = value;
            case AMOUNT -> amount[0] = parseAmountRange(value);
            case DATE -> date[0] = parseDateRange(value, today);
        }
    }

    // ── aralık parse ────────────────────────────────────────────────────────

    private ParsedQuery.Range parseAmountRange(String v) {
        try {
            if (v.contains("..")) {
                String[] parts = v.split("\\.\\.", 2);
                BigDecimal min = parts[0].isBlank() ? null : new BigDecimal(parts[0].trim());
                BigDecimal max = parts[1].isBlank() ? null : new BigDecimal(parts[1].trim());
                return new ParsedQuery.Range(min, max);
            }
            if (v.startsWith(">=")) return new ParsedQuery.Range(new BigDecimal(v.substring(2).trim()), null);
            if (v.startsWith("<=")) return new ParsedQuery.Range(null, new BigDecimal(v.substring(2).trim()));
            if (v.startsWith(">")) return new ParsedQuery.Range(new BigDecimal(v.substring(1).trim()), null);
            if (v.startsWith("<")) return new ParsedQuery.Range(null, new BigDecimal(v.substring(1).trim()));
            BigDecimal exact = new BigDecimal(v.trim());
            return new ParsedQuery.Range(exact, exact);
        } catch (NumberFormatException e) {
            throw new SearchQueryException("Geçersiz tutar: '" + v + "'. Örnek: tutar:>5000 veya tutar:1000..5000.");
        }
    }

    private ParsedQuery.DateRange parseDateRange(String v, LocalDate today) {
        // Anahtar kelime mi?
        Optional<ParsedQuery.DateRange> kw = DateKeyword.resolve(v, today);
        if (kw.isPresent()) return kw.get();
        try {
            if (v.contains("..")) {
                String[] parts = v.split("\\.\\.", 2);
                LocalDate from = parts[0].isBlank() ? null : startOf(parts[0].trim());
                LocalDate to = parts[1].isBlank() ? null : endOf(parts[1].trim());
                return new ParsedQuery.DateRange(from, to);
            }
            return new ParsedQuery.DateRange(startOf(v.trim()), endOf(v.trim()));
        } catch (DateTimeParseException e) {
            throw new SearchQueryException("Geçersiz tarih: '" + v
                    + "'. Örnek: tarih:2026-01, tarih:2026-01-15, tarih:son-ay.");
        }
    }

    /** "2026" / "2026-01" / "2026-01-15" → aralığın başlangıcı. */
    private LocalDate startOf(String s) {
        if (s.matches("\\d{4}")) return LocalDate.of(Integer.parseInt(s), 1, 1);
        if (s.matches("\\d{4}-\\d{2}")) return YearMonth.parse(s).atDay(1);
        return LocalDate.parse(s);
    }

    private LocalDate endOf(String s) {
        if (s.matches("\\d{4}")) return LocalDate.of(Integer.parseInt(s), 12, 31);
        if (s.matches("\\d{4}-\\d{2}")) return YearMonth.parse(s).atEndOfMonth();
        return LocalDate.parse(s);
    }

    // ── tokenize / helpers ───────────────────────────────────────────────────

    private List<String> tokenize(String raw) {
        List<String> out = new ArrayList<>();
        Matcher m = TOKEN.matcher(raw.trim());
        while (m.find()) {
            out.add(m.group());
            if (out.size() > MAX_TOKENS) {
                throw new SearchQueryException("Arama sorgusu çok karmaşık (en fazla " + MAX_TOKENS + " parça).");
            }
        }
        return out;
    }

    /** field:value ayracını bulur; tırnak içindeki ':' göz ardı edilir. */
    private int fieldColonIndex(String tok) {
        int colon = tok.indexOf(':');
        if (colon <= 0) return -1;
        // Tırnakla başlıyorsa bu bir phrase, field değil.
        if (tok.charAt(0) == '"') return -1;
        // ':' öncesi yalnız harf/alt-çizgi olmalı (field token kuralı).
        for (int i = 0; i < colon; i++) {
            char c = tok.charAt(i);
            if (!Character.isLetter(c) && c != '_') return -1;
        }
        return colon;
    }

    private String stripQuotes(String s) {
        if (s == null) return "";
        String t = s.trim();
        if (t.length() >= 2 && t.startsWith("\"") && t.endsWith("\"")) {
            return t.substring(1, t.length() - 1).trim();
        }
        return t;
    }
}
