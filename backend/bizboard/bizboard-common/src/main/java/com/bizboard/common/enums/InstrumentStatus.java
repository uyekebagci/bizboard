package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz D, §3.7) — kıymetli evrak yaşam döngüsü.
 *
 * <pre>
 *   PENDING_OCR ──onay──▶ CONFIRMED ──tahsil/ödeme──▶ CASHED
 *                              │
 *                              ├──karşılıksız──▶ BOUNCED
 *                              └──ciro/devir───▶ ENDORSED
 * </pre>
 *
 * <ul>
 *   <li>{@link #PENDING_OCR} — Telegram-foto/OCR ile geldi, kullanıcı onayı bekliyor
 *       (manuel girişte doğrudan CONFIRMED açılır).</li>
 *   <li>{@link #CONFIRMED}   — Portföyde / takipte (henüz para hareketi yok).</li>
 *   <li>{@link #CASHED}      — Tahsil/ödeme tamam → para hesabına Σ=0 posting yazıldı.</li>
 *   <li>{@link #BOUNCED}     — Karşılıksız çıktı (kritik).</li>
 *   <li>{@link #ENDORSED}    — Ciro edildi / devredildi (başka counterpart'a).</li>
 * </ul>
 */
public enum InstrumentStatus {
    PENDING_OCR,
    CONFIRMED,
    CASHED,
    BOUNCED,
    ENDORSED;

    /** Para hareketi (tahsil/ödeme) yapılabilir durum mu? */
    public boolean isCashable() {
        return this == CONFIRMED;
    }

    /** Ciro/devir yapılabilir durum mu? */
    public boolean isEndorsable() {
        return this == CONFIRMED;
    }

    /** Nihai (artık geçiş yapılamaz) durum mu? */
    public boolean isTerminal() {
        return this == CASHED || this == BOUNCED;
    }
}
