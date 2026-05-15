package com.bizboard.common.enums;

/**
 * Türkiye tüzel kişi tipleri — {@code my_companies.company_type} kolonu için.
 *
 * <ul>
 *   <li>{@link #AS} — Anonim Şirket</li>
 *   <li>{@link #LTD} — Limited Şirket</li>
 *   <li>{@link #SAHIS} — Şahıs İşletmesi</li>
 *   <li>{@link #KOOP} — Kooperatif</li>
 *   <li>{@link #DERNEK} — Dernek</li>
 *   <li>{@link #OTHER} — Diğer (vakıf, kamu vb.)</li>
 * </ul>
 */
public enum CompanyType {
    AS,
    LTD,
    SAHIS,
    KOOP,
    DERNEK,
    OTHER
}
