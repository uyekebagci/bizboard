package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz B — Gün Açılışı) — bir {@code DayOpen} kaydının NASIL oluştuğu
 * izi (audit + UI rozet için).
 *
 * <ul>
 *   <li>{@link #MANUAL}       — kullanıcı "Günü Aç" akışıyla açtı (hesap açılışları
 *       + devir yuvarlama elle düzeltildi/onaylandı).</li>
 *   <li>{@link #BACKDATED}    — admin geçmiş bir tarihi açtı (feature flag arkasında,
 *       geçici migrasyon capability'si — DayClose backdate ile aynı kapı).</li>
 *   <li>{@link #AUTO}         — sistem/cron otomatik açtı (devir tam aktarıldı,
 *       yuvarlama=0). İleride otomatik açılış senaryosu için.</li>
 *   <li>{@link #CLOSE_SYNC}   — DayClose finalize edilince DayOpen yoksa otomatik
 *       oluşturuldu/CLOSED işaretlendi (geriye-uyum: gün hiç açılmadan kapatıldıysa).</li>
 * </ul>
 */
public enum DayOpenCreatedVia {
    MANUAL,
    BACKDATED,
    AUTO,
    CLOSE_SYNC
}
