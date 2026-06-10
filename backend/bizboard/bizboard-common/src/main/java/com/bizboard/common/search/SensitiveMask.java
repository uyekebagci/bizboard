package com.bizboard.common.search;

/**
 * v2.2.0 — hassas alan maskeleme yardımcıları (spec §4, §10.7, L8).
 *
 * <p>Maskeleme <b>her zaman serbest metni eşleştirdikten SONRA</b> uygulanır:
 * kullanıcı {@code vkn:1234567890} aratıp eşleşme alabilir ama tam VKN response'a
 * sızmaz (spec §14.2 "Field-based bypass attempt"). Maskeleme deterministik ve
 * geri-döndürülemez (one-way) string transform'dur.</p>
 */
public final class SensitiveMask {

    private SensitiveMask() {}

    /** VKN/TCKN → son 4 hane görünür: {@code *******1234}. */
    public static String taxId(String value) {
        return lastN(value, 4, '*');
    }

    /** MERSIS → son 4 hane görünür. */
    public static String mersis(String value) {
        return lastN(value, 4, '*');
    }

    /**
     * IBAN → ilk 2 (ülke) + son 4 görünür, ortası maskeli, 4'erli gruplu:
     * {@code TR** **** **** **** **** **89 45} benzeri. Boşluk/format toleranslı.
     */
    public static String iban(String value) {
        if (value == null || value.isBlank()) return value;
        String clean = value.replaceAll("\\s", "").toUpperCase();
        if (clean.length() < 8) return repeat('*', clean.length());
        String head = clean.substring(0, 2);
        String tail = clean.substring(clean.length() - 4);
        StringBuilder masked = new StringBuilder(head);
        masked.append(repeat('*', clean.length() - 6));
        masked.append(tail);
        return group4(masked.toString());
    }

    /** Maaş gibi tamamen gizlenen alanlar için rozet placeholder. */
    public static String hidden() {
        return "🔒";
    }

    // ── helpers ──

    private static String lastN(String value, int n, char fill) {
        if (value == null || value.isBlank()) return value;
        String clean = value.trim();
        if (clean.length() <= n) return clean;
        return repeat(fill, clean.length() - n) + clean.substring(clean.length() - n);
    }

    private static String group4(String s) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            if (i > 0 && i % 4 == 0) out.append(' ');
            out.append(s.charAt(i));
        }
        return out.toString();
    }

    private static String repeat(char c, int n) {
        if (n <= 0) return "";
        return String.valueOf(c).repeat(n);
    }
}
