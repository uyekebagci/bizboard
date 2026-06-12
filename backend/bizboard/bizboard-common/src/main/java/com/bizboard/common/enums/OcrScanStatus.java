package com.bizboard.common.enums;

import java.util.Locale;

/**
 * OCR Modülü (WP 1bdb8116) — taranan belgenin yaşam döngüsü durumu.
 *
 * <ul>
 *   <li>{@link #EXTRACTED} — OCR çalıştı, alanlar çıkarıldı, kullanıcı onayı bekliyor.</li>
 *   <li>{@link #LOW_CONFIDENCE} — çıkarıldı ama bazı alanların güveni düşük (vurgulu onay).</li>
 *   <li>{@link #FAILED} — OCR otomatik okuyamadı (manuel giriş gerekir; degrade yolu).</li>
 *   <li>{@link #CONFIRMED} — kullanıcı onayladı → transaction/instrument oluşturuldu.</li>
 *   <li>{@link #DISCARDED} — kullanıcı taramayı attı.</li>
 * </ul>
 */
public enum OcrScanStatus {
    EXTRACTED,
    LOW_CONFIDENCE,
    FAILED,
    CONFIRMED,
    DISCARDED;

    public static OcrScanStatus parse(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Geçersiz OCR status: " + raw);
        }
    }

    /** Onay/işlem yapılabilir mi (terminal değil). */
    public boolean isPending() {
        return this == EXTRACTED || this == LOW_CONFIDENCE || this == FAILED;
    }
}
