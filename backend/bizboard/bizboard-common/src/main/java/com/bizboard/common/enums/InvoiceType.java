package com.bizboard.common.enums;

/**
 * e-Fatura tipi (UBL-TR {@code cbc:InvoiceTypeCode}).
 *
 * <ul>
 *   <li>{@link #SATIS} — SATIS: standart satış faturası.</li>
 *   <li>{@link #IADE} — IADE: iade faturası.</li>
 *   <li>{@link #TEVKIFAT} — TEVKIFAT: KDV tevkifatlı fatura.</li>
 *   <li>{@link #ISTISNA} — ISTISNA: KDV istisnalı fatura.</li>
 *   <li>{@link #OZELMATRAH} — OZELMATRAH: özel matrah faturası.</li>
 * </ul>
 *
 * <p>v1.1'de SATIS / IADE tam desteklenir; diğerleri arayüzde seçilebilir ama
 * özel matrah/tevkifat detayları (entegratör seçilince) genişletilecek.</p>
 */
public enum InvoiceType {

    SATIS("SATIS"),
    IADE("IADE"),
    TEVKIFAT("TEVKIFAT"),
    ISTISNA("ISTISNA"),
    OZELMATRAH("OZELMATRAH");

    private final String code;

    InvoiceType(String code) {
        this.code = code;
    }

    /** UBL-TR {@code cbc:InvoiceTypeCode} değeri. */
    public String code() {
        return code;
    }
}
