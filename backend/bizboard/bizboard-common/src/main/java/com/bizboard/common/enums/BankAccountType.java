package com.bizboard.common.enums;

/**
 * v1.6.18 (WP-1): Banka hesap tipi.
 * v1.6.23.25 (UI Fix WP TODO 39a4218b): Kasa hiyerarşisi.
 *
 * <ul>
 *   <li>{@link #CHECKING}    — Vadesiz banka hesabı</li>
 *   <li>{@link #SAVINGS}     — Vadeli banka hesabı</li>
 *   <li>{@link #MAIN_CASH}   — <b>Ana Kasa</b>: her business için tam 1 tane,
 *       otomatik yaratılır (BusinessService hook), silinemez (business cascade
 *       hariç). DB seviyesinde unique partial index ile garanti edilir.</li>
 *   <li>{@link #SUB_CASH}    — Alt kasa: kullanıcı manuel yaratır, tam CRUD.
 *       v1.6.23.25 öncesi {@code CASH} tipi tüm satırları SUB_CASH'a migrate edildi.</li>
 *   <li>{@link #CASH_HOLDER} — Kişide tutulan kasa ("Gökhan Eldeki" gibi).
 *       {@code holder_person_id} doldurulmalı (PERSON tipinde counterpart FK).</li>
 * </ul>
 */
public enum BankAccountType {
    CHECKING,
    SAVINGS,
    MAIN_CASH,
    SUB_CASH,
    CASH_HOLDER;

    /** v1.6.23.25: MAIN_CASH yalnız otomatik yaratılır — user create modal'da yok. */
    public boolean isUserCreatable() {
        return this != MAIN_CASH;
    }

    /** v1.6.23.25: MAIN_CASH user delete edemez — sadece business cascade. */
    public boolean isUserDeletable() {
        return this != MAIN_CASH;
    }
}
