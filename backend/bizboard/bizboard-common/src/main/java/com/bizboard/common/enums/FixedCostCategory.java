package com.bizboard.common.enums;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * v1.5.7: yeni işletme wizard'ında aylık sabit masraf adımı için 12 standart
 * kategori. İlk 11'i wizard'da zorunlu kalemler olarak listelenir; OTHER
 * "Diğer" serbest girişi temsil eder.
 *
 * <p>Wizard tarafında her kategori için bir tutar satırı + "Geçerli değil"
 * toggle gösterilir. Toggle açıkken kategori girişe kapalı (bu işletmeye
 * uygulanmıyor) — submit'te zorunlu sayılmaz.</p>
 *
 * <p>{@code FixedCost.type} field'ı serbest String olarak kalmaya devam eder
 * (geriye uyumluluk); ancak yeni create akışı bu enum sabitlerinden gelen
 * isimleri kullanır.</p>
 */
public enum FixedCostCategory {

    RENT("Kira / Yer Maliyeti"),
    PERSONNEL("Personel Maaşı + SGK"),
    UTILITY("Elektrik / Su / Doğalgaz / İnternet"),
    VEHICLE("Araç (Kira / Yakıt / Bakım)"),
    SUPPLIES("Ofis / İşletme Sarf Malzemesi"),
    MARKETING("Pazarlama / Reklam"),
    INSURANCE("Sigorta"),
    MAINTENANCE("Bakım / Onarım"),
    SOFTWARE("Yazılım / Abonelikler"),
    LEGAL("Hukuk / Muhasebe / Müşavir"),
    TAX("Vergi / Stopaj / Harç"),
    OTHER("Diğer");

    private final String label;

    FixedCostCategory(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    /** Wizard adım 2'de zorunlu listelenen 11 kategori (OTHER hariç). */
    public boolean isRequiredInWizard() {
        return this != OTHER;
    }

    /** Case-insensitive parse; bilinmeyen → OTHER. */
    public static FixedCostCategory parse(String s) {
        if (s == null || s.isBlank()) return OTHER;
        try {
            return FixedCostCategory.valueOf(s.trim().toUpperCase(Locale.ENGLISH));
        } catch (IllegalArgumentException ex) {
            return OTHER;
        }
    }

    /** Frontend dropdown'ı için ordered map. */
    public static Map<String, String> labelMap() {
        Map<String, String> out = new LinkedHashMap<>();
        Arrays.stream(values()).forEach(c -> out.put(c.name(), c.label));
        return out;
    }
}
