package com.bizboard.common.enums;

/**
 * Karşı firmanın bizimle ilişkisi.
 *
 * <ul>
 *   <li>{@link #CUSTOMER} — Müşteri (bize satıyoruz / hizmet veriyoruz)</li>
 *   <li>{@link #SUPPLIER} — Tedarikçi (bizim aldığımız)</li>
 *   <li>{@link #BOTH} — Hem müşteri hem tedarikçi (cari hesap iki yönlü)</li>
 *   <li>{@link #OTHER} — Diğer (banka, kamu, taşıyıcı vb.)</li>
 * </ul>
 */
public enum CounterpartRole {
    CUSTOMER,
    SUPPLIER,
    BOTH,
    OTHER
}
