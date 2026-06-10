package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz C, §3.4 / §6) — POS kâr-payı şelalesinde bir operatörün
 * payının NASIL hesaplanacağını belirleyen kural tipi.
 *
 * <p>Per-deal şelale (KİLİTLİ — §6):</p>
 * <ul>
 *   <li>{@link #RATE_SPREAD} — Kemal / çalışan: aynı gün KESİN.
 *       {@code pay = (müşteri_oranı − sahip_baz%) × hacim}. Oran spread'i;
 *       komisyon T+1 değil — deal girilince final posting.</li>
 *   <li>{@link #MARGIN_PCT} — Fatih: aynı gün KESİN, banka komisyonundan
 *       BAĞIMSIZ. {@code pay = marj × %sabit (config: fatih_margin_pct)}.
 *       Marj = (müşteri_oranı − sahip_baz%) × hacim (deal kârı). Final posting.</li>
 *   <li>{@link #OWNER_COMMISSION} — Tuncay (POS sahibi/patron): T+1.
 *       {@code pay = (sahip_baz% − ort.komisyon) × hacim}. Ort.komisyon ancak
 *       gün kapanışında banka yatışı girilince kesinleşir → provisional (deal
 *       günü, ort.komisyon yerine deviceBankRate tahminiyle) → final adjust
 *       (settlement batch).</li>
 *   <li>{@link #RESIDUAL} — Şirket: kalan artık. Şelaledeki diğer paylardan
 *       SONRA kalan tutar; ayrı bir operatör kasasına değil şirket P&L'ine
 *       (RESIDUAL) yazılır. Genelde explicit kural yerine türetilir.</li>
 * </ul>
 *
 * <p><b>Zamanlama (§3.11):</b> {@code RATE_SPREAD}/{@code MARGIN_PCT} = aynı gün
 * (final); {@code OWNER_COMMISSION} = T+1 (provisional → final adjust).
 * {@link #isDeferredToSettlement()} bunu sabitler.</p>
 */
public enum ProfitShareRuleType {

    /** Kemal/çalışan: (müşteri_oranı − sahip_baz%) × hacim, aynı gün kesin. */
    RATE_SPREAD,

    /** Fatih: marj × config-yüzde (komisyondan bağımsız), aynı gün kesin. */
    MARGIN_PCT,

    /** Tuncay (sahip): (sahip_baz% − ort.komisyon) × hacim, T+1 provisional→final. */
    OWNER_COMMISSION,

    /** Şirket: kalan artık (residual). */
    RESIDUAL;

    /**
     * Bu kural komisyona bağlı mı (T+1 settlement'a kadar provisional)?
     * Sadece {@link #OWNER_COMMISSION} ort.komisyonu gün kapanışında bekler;
     * diğerleri deal anında kesinleşir.
     */
    public boolean isDeferredToSettlement() {
        return this == OWNER_COMMISSION;
    }
}
