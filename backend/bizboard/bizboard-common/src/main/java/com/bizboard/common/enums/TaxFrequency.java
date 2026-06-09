package com.bizboard.common.enums;

/**
 * Vergi Takvimi Modülü — bir vergi yükümlülüğünün tekrarlama sıklığı.
 *
 * <p>Tekrarlayan kural motoru ({@code TaxCalendarService}) bu sıklığa göre
 * verilen tarih aralığında somut son tarihleri üretir.</p>
 */
public enum TaxFrequency {

    /** Her ay tekrarlar (ör. KDV, Muhtasar, BA-BS). */
    MONTHLY,

    /** Üç aylık dönemlerde tekrarlar (ör. Geçici Vergi). */
    QUARTERLY,

    /** Yılda bir kez (ör. Kurumlar / Gelir Vergisi yıllık beyan). */
    YEARLY
}
