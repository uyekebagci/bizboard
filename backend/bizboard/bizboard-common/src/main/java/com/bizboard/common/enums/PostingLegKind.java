package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz A): bir posting bacağının (leg) muhasebe niteliği —
 * "bu hareket konum mu değiştirdi, yoksa P&L'i mi etkiledi?" sorusunun cevabı.
 *
 * <p>Çift-giriş invariant'ı korunur: bir {@code JournalEntry}'deki tüm
 * posting'lerin {@code amount} toplamı 0'dır. {@code leg_kind} o bacağın
 * raporlamada nasıl sınıflanacağını belirler.</p>
 *
 * <ul>
 *   <li>{@link #LOCATION_MOVE} — Konum hareketi: para bir hesaptan diğerine
 *       taşındı; P&L'i ETKİLEMEZ (transfer bacakları, POS yatış havuzu, nakit
 *       hesabına giriş/çıkış). Gelir/gider raporuna girmez.</li>
 *   <li>{@link #PNL_INCOME}    — Gelir (satış, hizmet geliri, POS geliri).</li>
 *   <li>{@link #PNL_EXPENSE}   — Gider (kira/maaş/operatör payı) — operasyonel.</li>
 *   <li>{@link #PNL_COST}      — Masraf (banka komisyonu/transfer ücreti) —
 *       gider ≠ masraf ayrımı (§3.3); P&L'de ayrı satır.</li>
 * </ul>
 */
public enum PostingLegKind {
    LOCATION_MOVE,
    PNL_INCOME,
    PNL_EXPENSE,
    PNL_COST
}
