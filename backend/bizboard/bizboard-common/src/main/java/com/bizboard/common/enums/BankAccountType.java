package com.bizboard.common.enums;

/**
 * v1.6.18 (WP-1): Banka hesap tipi.
 *
 * <ul>
 *   <li>{@link #CHECKING} — Vadesiz hesap</li>
 *   <li>{@link #SAVINGS} — Vadeli hesap</li>
 *   <li>{@link #CASH} — Kasa (fiziksel nakit hesabı)</li>
 *   <li>{@link #CASH_HOLDER} — Kişide tutulan kasa ("Gökhan Eldeki" gibi).
 *       Bu tip için {@code holder_person_id} doldurulmalı (PERSON tipinde
 *       counterpart FK).</li>
 * </ul>
 */
public enum BankAccountType {
    CHECKING,
    SAVINGS,
    CASH,
    CASH_HOLDER
}
