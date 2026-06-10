package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz B, §3.6) — bir {@code DayClose} kaydının NASIL oluştuğu/
 * son güncellendiği izi. Audit + UI rozet + recompute davranışı için.
 *
 * <ul>
 *   <li>{@link #AUTO_CRON}      — 20:00 cron otomatik açtı/kapattı (actual=null).</li>
 *   <li>{@link #TODAY}          — kullanıcı bugünü finalize etti (sayım girdi).</li>
 *   <li>{@link #BACKDATED}      — §4.1 admin geçmiş bir tarihe kapanış açtı
 *       (feature flag arkasında, geçici migrasyon capability'si).</li>
 *   <li>{@link #EDIT_APPROVED}  — §4.2 onaylı düzenleme (PENDING→approve→apply)
 *       sonucu güncellendi.</li>
 *   <li>{@link #CHAIN_RECOMPUTE} — §4.1 {@code recomputeChainFrom} ileri-zincir
 *       yeniden hesaplaması bu günün opening/computed/variance'ını yeniledi.</li>
 *   <li>{@link #MIGRATED}       — §8.5 eski {@code CashClosing}'ten migrate edildi.</li>
 * </ul>
 */
public enum DayCloseCreatedVia {
    AUTO_CRON,
    TODAY,
    BACKDATED,
    EDIT_APPROVED,
    CHAIN_RECOMPUTE,
    MIGRATED
}
