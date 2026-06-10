package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz B, §4.2) — onaylı gün-kapanışı düzenleme isteği
 * ({@code DayCloseEditRequest}) durum makinesi.
 *
 * <p>Finalize (CLOSED) bir kapanışı düzeltmek DOĞRUDAN uygulanmaz: admin öneri
 * açar (PENDING), yetkili onaylar (APPROVED→APPLIED) ya da reddeder (REJECTED).
 * Approver kanalı pluggable — bugün in-app, ileride Faz-2 Telegram onay (§4.2).</p>
 *
 * <ul>
 *   <li>{@link #PENDING}  — öneri açıldı; kapanış DEĞİŞMEDİ. before_snapshot alındı.</li>
 *   <li>{@link #APPROVED} — onaylandı; uygulama (apply) bekleniyor (genelde aynı tx).</li>
 *   <li>{@link #APPLIED}  — DayClose güncellendi (created_via=EDIT_APPROVED) +
 *       zincir yeniden hesaplandı.</li>
 *   <li>{@link #REJECTED} — reddedildi; kapanış el değmemiş kaldı (reject_note).</li>
 * </ul>
 */
public enum DayCloseEditStatus {
    PENDING,
    APPROVED,
    APPLIED,
    REJECTED
}
