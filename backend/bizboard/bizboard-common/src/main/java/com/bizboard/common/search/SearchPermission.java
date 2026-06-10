package com.bizboard.common.search;

/**
 * v2.2.0 — hassas alan görünürlüğünü kontrol eden permission'lar (spec §4 maskeleme
 * tablosu, L8 response sanitization).
 *
 * <p>Çatı'nın mevcut yetki modeli rol-tabanlıdır ({@code role=admin} her şeyi
 * görür). Bu enum, ileride RBAC genişlediğinde tek değişiklik noktası olsun diye
 * ayrı tutulur. Şu an için yalnız ADMIN bu permission'ların tümüne sahiptir;
 * normal kullanıcılar hassas alanları maskeli görür.</p>
 */
public enum SearchPermission {
    COUNTERPART_FULL_VIEW,
    MY_COMPANY_FULL_VIEW,
    BANK_FULL_VIEW,
    HR_FULL_VIEW,
    FINANCE_FULL_VIEW
}
