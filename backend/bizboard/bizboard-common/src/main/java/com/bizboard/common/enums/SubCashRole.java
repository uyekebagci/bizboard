package com.bizboard.common.enums;

/**
 * Ledger v2 (Faz C, §3.11) — bir {@code SUB_CASH} hesabının rolü.
 *
 * <p>SUB_CASH tipi iki ayrı amaca hizmet edebilir:</p>
 * <ul>
 *   <li>{@link #AGGREGATE} — klasik alt-kasa: atanan banka/kasa hesaplarının
 *       bakiye toplamı (mevcut {@code SubCashAggregateService} davranışı).
 *       Kullanıcı manuel atama yapar; bakiye = Σ üye-hesap.</li>
 *   <li>{@link #PROFIT_CENTER} — operatör kâr-merkezi (Kemal/Fatih/Tuncay):
 *       READ-ONLY. Manuel giriş YOK; bakiye = Σ(otomatik kâr-payı posting
 *       {@code source=auto}+deal_id) − Σ(operatöre ödeme). POS şelalesi payları
 *       buraya {@code PROFIT_SHARE} journal entry ile otomatik postalanır.</li>
 * </ul>
 *
 * <p>Default {@link #AGGREGATE} (kırılma yok); operatör kasaları create/migration
 * ile {@link #PROFIT_CENTER}'a işaretlenir. Bir hesap operatör kasası ise
 * ({@code operatorCounterpart} set) bu role otomatik {@code PROFIT_CENTER} olur.</p>
 */
public enum SubCashRole {
    AGGREGATE,
    PROFIT_CENTER;

    public boolean isProfitCenter() {
        return this == PROFIT_CENTER;
    }
}
