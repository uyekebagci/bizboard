package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz D, §3.7) — kıymetli evrak tipi.
 *
 * <ul>
 *   <li>{@link #CHECK}            — Çek.</li>
 *   <li>{@link #PROMISSORY_NOTE}  — Senet.</li>
 * </ul>
 *
 * <p><b>NOT:</b> Bu, v1.7 {@code PaymentInstrument} (debt-tabanlı, {@code CEK}
 * string) entity'sinden AYRIDIR — Ledger v2 {@code Instrument} Posting
 * çekirdeğine bağlı yeni modeldir; eski entity kırılmaz.</p>
 */
public enum InstrumentType {
    CHECK,
    PROMISSORY_NOTE
}
