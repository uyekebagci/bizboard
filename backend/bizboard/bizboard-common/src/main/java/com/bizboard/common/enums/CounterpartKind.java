package com.bizboard.common.enums;

/**
 * v1.7.0 (WP-1): Karşı tarafın tipsel kategorisi.
 *
 * <p>{@link CounterpartRole} ile karıştırılmamalı — role iş ilişkisini tanımlar
 * (CUSTOMER/SUPPLIER/BOTH/OTHER), kind ise varlık tipini (gerçek kişi mi tüzel
 * kişi mi). PERSON kayıtları için UI ayrı form akışı (TCKN, ad-soyad) gösterir;
 * FIRM kayıtları için VKN, firma adı.</p>
 */
public enum CounterpartKind {
    /** Gerçek kişi — TCKN. */
    PERSON,
    /** Tüzel kişi (şirket). */
    FIRM
}
