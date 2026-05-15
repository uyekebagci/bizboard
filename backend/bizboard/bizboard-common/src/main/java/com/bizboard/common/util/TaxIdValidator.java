package com.bizboard.common.util;

/**
 * Türkiye Vergi Kimlik Numarası (VKN — 10 hane) ve TC Kimlik Numarası (TCKN — 11 hane)
 * format + checksum doğrulama. Frontend'de de aynı algoritma var; backend güvenlik için
 * son söz burada (UI bypass edilse de yanlış format reddedilir).
 *
 * <p>Boş string / null → {@link #isValid} false döner. Caller'lar "tax_id opsiyonel"
 * olan alanlarda önce null check yapıp valid değilse 400 ile reddetmeli.</p>
 */
public final class TaxIdValidator {

    private TaxIdValidator() {}

    /** VKN veya TCKN'den biri geçerli mi? */
    public static boolean isValid(String s) {
        return isValidVkn(s) || isValidTckn(s);
    }

    /**
     * VKN — 10 hane. Algoritma: pozisyon i (1..9) için
     * tmp_i = (digit_i + 10 - i) mod 10
     * c_i = (tmp_i * 2^(10-i)) mod 9 (tmp_i != 0 && tmp_i != 9 ise; aksi halde tmp_i)
     * Toplam c_i'nin (10 - mod 10) → 10. hane.
     */
    public static boolean isValidVkn(String s) {
        if (s == null || s.length() != 10) return false;
        int[] d = new int[10];
        for (int i = 0; i < 10; i++) {
            char c = s.charAt(i);
            if (c < '0' || c > '9') return false;
            d[i] = c - '0';
        }
        long sum = 0;
        for (int i = 0; i < 9; i++) {
            int tmp = (d[i] + (9 - i)) % 10;
            if (tmp == 0) {
                // *2^... = 0 → toplama eklenmez
                continue;
            }
            long product = (long) tmp * pow2(9 - i);
            sum += product % 9 == 0 ? 9 : product % 9;
        }
        int expected = (int) ((10 - (sum % 10)) % 10);
        return expected == d[9];
    }

    /**
     * TCKN — 11 hane. Algoritma:
     * - ilk hane != 0
     * - (1+3+5+7+9. haneler toplamı)*7 - (2+4+6+8. haneler toplamı) mod 10 = 10. hane
     * - ilk 10 hane toplamı mod 10 = 11. hane
     */
    public static boolean isValidTckn(String s) {
        if (s == null || s.length() != 11) return false;
        int[] d = new int[11];
        for (int i = 0; i < 11; i++) {
            char c = s.charAt(i);
            if (c < '0' || c > '9') return false;
            d[i] = c - '0';
        }
        if (d[0] == 0) return false;

        int odd = d[0] + d[2] + d[4] + d[6] + d[8];
        int even = d[1] + d[3] + d[5] + d[7];
        int digit10 = ((odd * 7) - even) % 10;
        if (digit10 < 0) digit10 += 10;
        if (digit10 != d[9]) return false;

        int sum10 = 0;
        for (int i = 0; i < 10; i++) sum10 += d[i];
        return sum10 % 10 == d[10];
    }

    private static long pow2(int n) {
        long r = 1;
        for (int i = 0; i < n; i++) r *= 2;
        return r;
    }
}
