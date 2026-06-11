package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz B — Gün Açılışı, §4 madde 2-3 genişletme) — gün AÇILIŞ durum
 * makinesi (işletme + tarih başına).
 *
 * <p>Tam gün-yaşam-döngüsü {@code DayOpen} + {@link DayCloseStatus} birleşiminden
 * türetilir:</p>
 *
 * <pre>
 *   AÇILMAMIŞ (UNOPENED)  → o işletme+tarih için DayOpen kaydı YOK.
 *   AÇIK      (OPEN)      → kullanıcı günü açtı (hesap açılışları + devir yuvarlama
 *                           onaylandı). İşlem girişi YALNIZ bu durumda serbest.
 *   KAPALI    (CLOSED)    → DayClose finalize edildi (Faz B kapanış). DayOpen
 *                           durumu CLOSED'a geçer; gün kilitli (düzeltme = onaylı
 *                           DayCloseEditRequest akışı).
 * </pre>
 *
 * <p><b>Not:</b> AÇILMAMIŞ bir enum değeri DEĞİL — "kayıt yok" durumudur. Bu enum
 * yalnız var-olan {@code DayOpen} kaydının iki canlı durumunu (OPEN/CLOSED)
 * taşır. Üst-katman (DayLifecycleStatus DTO alanı) AÇILMAMIŞ'ı "kayıt yok" olarak
 * raporlar.</p>
 */
public enum DayOpenStatus {
    /** Gün açıldı — hesap açılışları sabitlendi; işlem girişi serbest. */
    OPEN,
    /** Gün kapatıldı (DayClose finalize) — kilitli. */
    CLOSED
}
