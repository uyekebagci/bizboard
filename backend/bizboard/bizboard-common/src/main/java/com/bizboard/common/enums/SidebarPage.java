package com.bizboard.common.enums;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Kanonik sidebar SAYFA anahtarları (page key) — kullanıcı-bazlı sayfa-erişim
 * feature'ının whitelist'i.
 *
 * <p>Bu enum, kullanıcının {@code allowed_pages} kolonunda saklanabilecek
 * GEÇERLI sayfa anahtarlarını tanımlar. {@code key} değerleri frontend sidebar
 * route'larıyla (href) eşleşir ve FE ile paylaşılan SÖZLEŞMEDIR — değiştirmeden
 * önce {@code lib/pages.ts} ile senkron tutun.</p>
 *
 * <p><b>Önemli:</b> Bu navigasyon/görünürlük seviyesidir; sayfa endpoint RBAC'ı
 * AYRI ve dokunulmamıştır. {@code allowed_pages} yalnızca sidebar görünürlüğünü
 * ve route guard yönlendirmesini etkiler.</p>
 *
 * <p><b>Admin-özel sayfalar burada YOK:</b> {@code adminOnly} sidebar item'ları
 * (Admin Paneli, Denetim, vb.) zaten rol filtresiyle korunur; per-user
 * sayfa-erişimi yalnız admin-dışı (viewer) sayfalar için anlamlıdır.</p>
 */
public enum SidebarPage {

    // ── Genel ──
    DASHBOARD("dashboard"),
    FIRMALARIM("firmalarim"),
    ADD_TRANSACTION("add-transaction"),
    TRANSACTIONS("transactions"),
    CATEGORIES("categories"),
    FINANCE("finance"),
    REPORTS("reports"),
    AI("ai"),
    E_FATURA("e-fatura"),
    FORECAST("forecast"),
    BUDGET("budget"),
    NOTIFICATIONS("notifications"),
    REMINDERS("reminders"),

    // ── Cari & Borçlar ──
    COUNTERPARTS("counterparts"),
    RECEIVABLES("receivables"),
    PAYABLES("payables"),
    LOANS("loans"),
    INSTRUMENTS("instruments"),

    // ── Kasa & Banka ──
    BANK_ACCOUNTS("bank-accounts"),
    CASH("cash"),
    POS("pos"),
    POS_PROFIT("pos-profit"),
    OPERATOR_CASH("operator-cash"),
    MONTHLY_PROFIT("monthly-profit"),
    CLOSURES("closures"),
    DAY_CLOSE("day-close"),
    BANK_IMPORT("bank-import"),

    // ── Operasyon ──
    INVENTORY("inventory"),
    ASSETS("assets"),
    OCR("ocr"),
    DOCUMENTS("documents"),
    PEOPLE("people"),
    PHONES("phones"),
    TAX_CALENDAR("tax-calendar");

    private final String key;

    SidebarPage(String key) {
        this.key = key;
    }

    public String getKey() {
        return key;
    }

    /** Tüm geçerli sayfa anahtarları (sıralı). */
    public static Set<String> allKeys() {
        Set<String> keys = new LinkedHashSet<>();
        for (SidebarPage p : values()) {
            keys.add(p.key);
        }
        return keys;
    }

    /** Verilen anahtar geçerli (tanımlı) bir sayfa anahtarı mı? */
    public static boolean isValidKey(String key) {
        if (key == null) return false;
        String trimmed = key.trim();
        return Arrays.stream(values()).anyMatch(p -> p.key.equals(trimmed));
    }
}
