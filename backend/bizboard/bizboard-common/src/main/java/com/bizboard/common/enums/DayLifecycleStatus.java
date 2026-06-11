package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz B — Gün Açılışı) — bir işletme+tarih için BİRLEŞİK gün yaşam-
 * döngüsü durumu. {@code DayOpen} (yoksa/OPEN/CLOSED) + {@code DayClose}
 * (PENDING/CLOSED) durumlarından TÜRETİLİR; UI rozeti ve enforcement bunu
 * tüketir.
 *
 * <pre>
 *   AÇILMAMIŞ → AÇIK → KAPALI
 * </pre>
 *
 * <ul>
 *   <li>{@link #UNOPENED} — DayOpen kaydı yok ve gün CLOSED değil → "Günü Aç" gerekir.
 *       İşlem girişi (enforcement açıkken) BLOKLU.</li>
 *   <li>{@link #OPEN}     — DayOpen.OPEN; gün açık → işlem girişi serbest.</li>
 *   <li>{@link #CLOSED}   — DayClose finalize / DayOpen.CLOSED → kilitli (düzeltme
 *       onaylı edit akışı).</li>
 * </ul>
 */
public enum DayLifecycleStatus {
    UNOPENED,
    OPEN,
    CLOSED
}
