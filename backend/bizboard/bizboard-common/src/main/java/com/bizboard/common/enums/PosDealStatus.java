package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz C, §3.5) — bir {@code PosDeal}'in kâr-payı yaşam döngüsü.
 *
 * <ul>
 *   <li>{@link #PENDING} — deal girildi, henüz kâr-payı işlenmedi (geçici durum;
 *       normalde create akışı hemen {@link #PROVISIONAL}/{@link #FINALIZED}'a geçer).</li>
 *   <li>{@link #PROVISIONAL} — aynı-gün payları (RATE_SPREAD/MARGIN_PCT) postalandı,
 *       ancak komisyona bağlı pay (OWNER_COMMISSION) TAHMİNİ (deviceBankRate ile);
 *       T+1 settlement bekliyor.</li>
 *   <li>{@link #FINALIZED} — settlement batch'i ort.komisyonla kesinleşti;
 *       OWNER_COMMISSION final adjust postalandı. Tüm paylar nihai.</li>
 *   <li>{@link #REVERSED} — deal geri alındı (tüm kâr posting'leri ters çevrildi).</li>
 * </ul>
 */
public enum PosDealStatus {
    PENDING,
    PROVISIONAL,
    FINALIZED,
    REVERSED
}
