package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz A): bir {@code JournalEntry}'nin hangi kaynaktan türediğini
 * belirtir. Posting çift-girişi her zaman bir kaynak olaydan (intent) türetilir;
 * bu enum o kaynağın tipini sabitler — bakiye/rapor/mutabakat tüketicileri bu
 * etikete göre filtre/grup yapabilir.
 *
 * <ul>
 *   <li>{@link #MANUAL_TX}        — UI'dan elle girilen {@code Transaction} (intent).</li>
 *   <li>{@link #BANK_IMPORT}      — Banka ekstre satırı (Faz B; iskelet).</li>
 *   <li>{@link #POS_SETTLE}       — POS yatış/settlement olayı (Faz C).</li>
 *   <li>{@link #PROFIT_SHARE}     — Operatör kâr-payı sistem-postası (Faz C, source=auto).</li>
 *   <li>{@link #INSTRUMENT}       — Çek/senet olayı (Faz D).</li>
 *   <li>{@link #DAY_CLOSE_ADJUST} — Gün kapanışı sayım düzeltmesi (Faz B).</li>
 *   <li>{@link #TRANSFER}         — İki bacaklı konum hareketi (paired tx).</li>
 *   <li>{@link #ASSET}            — Ayni/envanter olayı (Faz D).</li>
 * </ul>
 *
 * <p>Faz A'da yalnız {@link #MANUAL_TX} ve {@link #TRANSFER} backfill runner
 * tarafından üretilir; diğerleri ilgili fazlarda devreye girer.</p>
 */
public enum JournalSourceType {
    MANUAL_TX,
    BANK_IMPORT,
    POS_SETTLE,
    PROFIT_SHARE,
    INSTRUMENT,
    DAY_CLOSE_ADJUST,
    TRANSFER,
    ASSET
}
