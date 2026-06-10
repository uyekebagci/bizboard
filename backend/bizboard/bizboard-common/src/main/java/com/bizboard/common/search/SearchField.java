package com.bizboard.common.search;

import java.util.Arrays;
import java.util.Optional;

/**
 * v2.2.0 Advanced Search — allowlist'lenmiş query field'ları (spec §5.3, §5.5).
 *
 * <p><b>Güvenlik (T5):</b> parser yalnızca bu enum'da tanımlı field'ları kabul
 * eder. Tanınmayan field → 400 Bad Request. String interpolation YOK; tüm
 * değerler parametreli sorguya bağlanır.</p>
 */
public enum SearchField {
    TYPE("tip"),
    BUSINESS("isletme"),
    CATEGORY("kategori"),
    AMOUNT("tutar"),
    DATE("tarih"),
    STATUS("durum"),
    TAX_ID("vkn"),
    IBAN("iban"),
    TAG("etiket");

    private final String token;

    SearchField(String token) {
        this.token = token;
    }

    public String token() {
        return token;
    }

    public static Optional<SearchField> fromToken(String raw) {
        if (raw == null) return Optional.empty();
        String t = raw.trim().toLowerCase();
        return Arrays.stream(values()).filter(f -> f.token.equals(t)).findFirst();
    }

    /** Hata mesajında kullanıcıya gösterilecek "tanınan alanlar" listesi. */
    public static String knownTokens() {
        return String.join(", ", Arrays.stream(values()).map(f -> f.token).toList());
    }
}
