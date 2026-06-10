package com.bizboard.service.search;

import com.bizboard.common.search.ParsedQuery;

import java.util.ArrayList;
import java.util.List;

/**
 * v2.2.0 — {@link ParsedQuery} serbest-metin kriterlerini parametreli LIKE
 * pattern'lerine çevirir + snippet highlight üretir.
 *
 * <p><b>Güvenlik:</b> üretilen string'ler SQL'e interpolate EDİLMEZ — yalnız
 * {@code :param} değeri olarak bağlanır. LIKE özel karakterleri ({@code %}, {@code _},
 * {@code \\}) escape'lenir ki kullanıcı wildcard enjekte edemesin (T4/T5).</p>
 */
public final class SearchTerms {

    private SearchTerms() {}

    /**
     * İlk anlamlı serbest-metin kriterini tek bir LIKE pattern'ine çevirir
     * ({@code %term%}). Repository sorguları tek {@code :term} parametresi alır;
     * çoklu term/phrase için en belirgin olanı seçer (basitlik + index dostu).
     *
     * @return {@code %...%} pattern veya null (text kriteri yoksa)
     */
    public static String likePattern(ParsedQuery q) {
        String core = primaryText(q);
        if (core == null) return null;
        return "%" + escapeLike(core.toLowerCase()) + "%";
    }

    /** Autocomplete: prefix match ({@code term%}). */
    public static String prefixPattern(String prefix) {
        if (prefix == null || prefix.isBlank()) return null;
        return escapeLike(prefix.trim().toLowerCase()) + "%";
    }

    /** Re-rank ve snippet için ham (escape'siz, lowercase) ilk term. */
    public static String primaryText(ParsedQuery q) {
        if (!q.getPhrases().isEmpty()) return q.getPhrases().get(0);
        if (!q.getTerms().isEmpty()) return q.getTerms().get(0);
        if (!q.getOrGroups().isEmpty() && !q.getOrGroups().get(0).isEmpty()) {
            return q.getOrGroups().get(0).get(0);
        }
        return null;
    }

    /** Tüm serbest-metin kelimeleri (re-rank/exact-match boost için). */
    public static List<String> allTerms(ParsedQuery q) {
        List<String> out = new ArrayList<>(q.getTerms());
        out.addAll(q.getPhrases());
        q.getOrGroups().forEach(out::addAll);
        return out;
    }

    /**
     * {@code <mark>} highlight'lı snippet. Sadece eşleşen term {@code <mark>} ile
     * sarılır; geri kalan metin HTML-escape edilir (XSS önleme, spec §10.3).
     */
    public static String highlight(String text, ParsedQuery q) {
        if (text == null) return "";
        String safe = htmlEscape(text);
        String term = primaryText(q);
        if (term == null || term.isBlank()) return safe;
        String escTerm = htmlEscape(term);
        // case-insensitive, ilk eşleşmeyi sar.
        int idx = safe.toLowerCase().indexOf(escTerm.toLowerCase());
        if (idx < 0) return safe;
        return safe.substring(0, idx)
                + "<mark>" + safe.substring(idx, idx + escTerm.length()) + "</mark>"
                + safe.substring(idx + escTerm.length());
    }

    // ── helpers ──

    /** LIKE meta-karakterlerini ({@code \\ % _}) güvenli kıl. */
    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static String htmlEscape(String s) {
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
