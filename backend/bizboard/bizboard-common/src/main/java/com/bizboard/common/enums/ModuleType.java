package com.bizboard.common.enums;

public enum ModuleType {
    FINANCE,
    INVENTORY,
    STAFF,
    PROJECTS,
    DOCUMENTS,
    RESERVATIONS,
    VEHICLES,
    MENU,
    CRM,
    DEBT,
    NOTES,
    /** v1.5.10: dedicated "Sabit Masraflar" sekmesi (FixedCostsWidget'ı barındırır). */
    FIXED_COSTS,
    /**
     * Gün Açılışı/Kapanışı (per-işletme). Açıkken: işletme detayında "Gün Açılışı"/
     * "Gün Kapanışı" butonları + durum rozeti görünür VE işlem-giriş enforcement'i
     * devreye girer (gün AÇIK değilse {@code createTransaction} reddedilir). KAPALI
     * işletmelerde HİÇBİR engelleme yok — mevcut işlem akışı aynen çalışır
     * (NON-BREAKING). Etiket: "Gün Açılış/Kapanış".
     */
    DAY_CYCLE
}
