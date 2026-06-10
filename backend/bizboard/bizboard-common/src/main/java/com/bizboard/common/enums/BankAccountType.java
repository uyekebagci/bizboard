package com.bizboard.common.enums;

/**
 * v1.6.18 (WP-1): Banka hesap tipi.
 * v1.6.23.25 (UI Fix WP TODO 39a4218b): Kasa hiyerarşisi.
 * Ledger v2 (Faz A): Posting çekirdeği için 4 yeni tip eklendi (§3.1).
 *
 * <ul>
 *   <li>{@link #CHECKING}    — Vadesiz banka hesabı</li>
 *   <li>{@link #SAVINGS}     — Vadeli banka hesabı</li>
 *   <li>{@link #MAIN_CASH}   — <b>Ana Kasa</b>: her business için tam 1 tane,
 *       otomatik yaratılır (BusinessService hook), silinemez (business cascade
 *       hariç). DB seviyesinde unique partial index ile garanti edilir.</li>
 *   <li>{@link #SUB_CASH}    — Alt kasa: kullanıcı manuel yaratır, tam CRUD.
 *       v1.6.23.25 öncesi {@code CASH} tipi tüm satırları SUB_CASH'a migrate edildi.
 *       Ledger v2'de operatör kâr-merkezi rolünü taşır (READ-ONLY, Faz C).</li>
 *   <li>{@link #CASH_HOLDER} — Kişide tutulan kasa ("Gökhan Eldeki" gibi).
 *       {@code holder_person_id} doldurulmalı (PERSON tipinde counterpart FK).
 *       Gerçek para konumu — gün kapanışında bakiyesi sayılır (§3.12).</li>
 *   <li>{@link #POS_SETTLEMENT} — Ledger v2: T+1 bekleyen POS havuzu (banka/cihaz
 *       başına). POS çekimi yapılınca bu havuza girer, yatış olunca banka hesabına
 *       konum-hareketi ile aktarılır (Faz C).</li>
 *   <li>{@link #RECEIVABLE}  — Ledger v2: cari alacak hesabı (counterpart bazlı).</li>
 *   <li>{@link #PAYABLE}     — Ledger v2: cari borç hesabı (counterpart bazlı).</li>
 *   <li>{@link #ASSET}       — Ledger v2: ayni/envanter (araba/mal); satılınca
 *       P&L gelirine döner (Faz D).</li>
 * </ul>
 */
public enum BankAccountType {
    CHECKING,
    SAVINGS,
    MAIN_CASH,
    SUB_CASH,
    CASH_HOLDER,
    // ── Ledger v2 (Faz A) — yeni tipler (§3.1) ──
    POS_SETTLEMENT,
    RECEIVABLE,
    PAYABLE,
    ASSET;

    /**
     * v1.6.23.25: MAIN_CASH yalnız otomatik yaratılır — user create modal'da yok.
     * Ledger v2: sistem-türetilen hesaplar (POS_SETTLEMENT/RECEIVABLE/PAYABLE)
     * de elle yaratılmaz; backend tarafından otomatik açılır.
     */
    public boolean isUserCreatable() {
        return this != MAIN_CASH
                && this != POS_SETTLEMENT
                && this != RECEIVABLE
                && this != PAYABLE;
    }

    /** v1.6.23.25: MAIN_CASH user delete edemez — sadece business cascade. */
    public boolean isUserDeletable() {
        return this != MAIN_CASH
                && this != POS_SETTLEMENT
                && this != RECEIVABLE
                && this != PAYABLE;
    }

    /**
     * Ledger v2 (Faz A): bu tipin bakiyesi Posting'lerden TÜRETİLİR mi?
     * MAIN_CASH/SUB_CASH bakiyesi üye-hesap aggregate'i; diğerleri posting Σ'sı.
     * (Faz A'da yalnız bilgi amaçlı — derive servisi bunu kullanır.)
     */
    public boolean isPostingDerivable() {
        return this != MAIN_CASH && this != SUB_CASH;
    }
}
