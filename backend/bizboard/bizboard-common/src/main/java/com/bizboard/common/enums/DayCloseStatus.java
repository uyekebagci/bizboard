package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz B, §3.6) — gün-kapanışı (DayClose) durum makinesi.
 *
 * <p>Mevcut {@link CashClosingStatus} (PENDING/CLOSED/REOPENED) enum'u korunur;
 * DayClose ayrı bir omurga olduğu için kendi durum enum'unu taşır (anlam aynı,
 * tür ayrılığı net).</p>
 *
 * <ul>
 *   <li>{@link #PENDING}  — cron (veya manuel) gün açtı; sayım/finalize bekliyor.</li>
 *   <li>{@link #CLOSED}   — kullanıcı/cron finalize etti; opening/computed/actual/
 *       variance sabitlendi. Ertesi günün opening'i bu günün actual'ından devreder.</li>
 *   <li>{@link #REOPENED} — admin düzeltme için yeniden açtı (audit highlight).</li>
 * </ul>
 */
public enum DayCloseStatus {
    PENDING,
    CLOSED,
    REOPENED
}
