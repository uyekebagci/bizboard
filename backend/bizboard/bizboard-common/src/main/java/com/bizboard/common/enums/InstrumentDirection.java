package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz D, §3.7) — kıymetli evrak yönü.
 *
 * <ul>
 *   <li>{@link #RECEIVED} — Alınan (bizim ALACAĞIMIZ). Tahsil edilince para
 *       hesabımıza giriş (+).</li>
 *   <li>{@link #GIVEN}    — Verilen (bizim BORCUMUZ). Ödenince para hesabımızdan
 *       çıkış (−).</li>
 * </ul>
 */
public enum InstrumentDirection {
    RECEIVED,
    GIVEN
}
