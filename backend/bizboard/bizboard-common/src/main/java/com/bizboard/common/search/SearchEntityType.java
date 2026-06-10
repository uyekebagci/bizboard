package com.bizboard.common.search;

import java.util.Arrays;
import java.util.Optional;

/**
 * v2.2.0 Advanced Search — aranabilir entity tipleri (spec §4).
 *
 * <p>{@code tip:} field filtresinde kullanılır. Türkçe alias'lar query syntax'ında
 * (spec §5.3 {@code tip:transaction tip:debt}) kabul edilir; canonical isim
 * response'ta döner.</p>
 *
 * <p>Yeni entity eklendiğinde buraya bir sabit + bir {@code EntitySearchStrategy}
 * eklenir (spec §8.1).</p>
 */
public enum SearchEntityType {
    TRANSACTION("transaction", "islem", "işlem"),
    COUNTERPART("counterpart", "cari", "firma"),
    DEBT("debt", "borc", "borç", "alacak"),
    EMPLOYEE("employee", "personel", "calisan", "çalışan"),
    BANK_ACCOUNT("bank_account", "hesap", "banka"),
    MY_COMPANY("my_company", "firmam", "sirket", "şirket"),
    BUSINESS("business", "isletme", "işletme"),
    PAYMENT_INSTRUMENT("payment_instrument", "cek", "çek", "senet"),
    POS_DEVICE("pos_device", "pos"),
    INVENTORY_ITEM("inventory_item", "envanter", "stok"),
    VEHICLE("vehicle", "arac", "araç"),
    NOTE("note", "not");

    private final String[] aliases;

    SearchEntityType(String... aliases) {
        this.aliases = aliases;
    }

    /** Query syntax'ından gelen serbest metni ({@code tip:cari}) enum'a çevirir. */
    public static Optional<SearchEntityType> fromAlias(String raw) {
        if (raw == null || raw.isBlank()) return Optional.empty();
        String normalized = raw.trim().toLowerCase();
        return Arrays.stream(values())
                .filter(t -> t.name().equalsIgnoreCase(normalized)
                        || Arrays.stream(t.aliases).anyMatch(a -> a.equalsIgnoreCase(normalized)))
                .findFirst();
    }

    /** Response/JSON canonical değeri (örn. {@code TRANSACTION}). */
    public String wireValue() {
        return name();
    }
}
