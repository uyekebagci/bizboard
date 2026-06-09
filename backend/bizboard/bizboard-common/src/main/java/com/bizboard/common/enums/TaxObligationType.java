package com.bizboard.common.enums;

/**
 * Vergi Takvimi Modülü — TR vergi yükümlülük türleri (GİB referans).
 *
 * <p>Her tür {@code TaxDeadlineRule} ile bir tekrarlama kuralına bağlanır
 * (aylık / üç aylık / yıllık). Kullanıcıya yönelik etiket {@link #getLabel()}
 * ile TR olarak verilir; iç kimlik enum sabitidir.</p>
 */
public enum TaxObligationType {

    /** KDV-1 beyannamesi — aylık, izleyen ayın 28'i. */
    KDV("KDV Beyannamesi"),

    /** Muhtasar ve Prim Hizmet Beyannamesi — aylık, izleyen ayın 26'sı. */
    MUHTASAR("Muhtasar ve Prim Hizmet Beyannamesi"),

    /** Form Ba/Bs bildirimi — aylık, izleyen ayın son günü. */
    BA_BS("BA-BS Bildirimi"),

    /** Geçici Vergi — üç aylık (Q4 2022'den itibaren kaldırıldı). */
    GECICI_VERGI("Geçici Vergi Beyannamesi"),

    /** Kurumlar Vergisi yıllık beyannamesi — izleyen yıl Nisan. */
    KURUMLAR_VERGISI("Kurumlar Vergisi Beyannamesi"),

    /** Gelir Vergisi yıllık beyannamesi — izleyen yıl Mart. */
    GELIR_VERGISI("Gelir Vergisi Beyannamesi");

    private final String label;

    TaxObligationType(String label) {
        this.label = label;
    }

    /** Kullanıcıya gösterilecek TR etiket. */
    public String getLabel() {
        return label;
    }
}
