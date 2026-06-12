package com.bizboard.service.ocr;

/**
 * OCR Modülü (WP 1bdb8116) — tek bir çıkarılmış alan + güven skoru.
 *
 * <p>Field-level confidence scoring (OCR-WP TODO). Her alan kendi {@code confidence}
 * değerini taşır (0.0–1.0). Düşük güvenli alanlar FE'de kullanıcıya vurgulanır ve
 * onay adımında düzeltilmesi istenir.</p>
 *
 * @param key        mantıksal alan adı (ör. "amount", "due_date", "vendor")
 * @param value      ham metin değer (parse edilmemiş; FE düzenlenebilir gösterir)
 * @param confidence 0.0–1.0 arası güven; null = sağlayıcı güven vermedi
 */
public record OcrField(String key, String value, Double confidence) {

    /** Düşük güven eşiği — bunun altındaki alanlar onay öncesi flag'lenir. */
    public static final double LOW_CONFIDENCE_THRESHOLD = 0.55;

    public static OcrField of(String key, String value, Double confidence) {
        return new OcrField(key, value, confidence);
    }

    /** Güven yoksa (null) ya da eşiğin altındaysa düşük sayılır. */
    public boolean isLowConfidence() {
        return confidence == null || confidence < LOW_CONFIDENCE_THRESHOLD;
    }

    public boolean hasValue() {
        return value != null && !value.isBlank();
    }
}
