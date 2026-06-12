package com.bizboard.service.ocr;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * OCR Modülü (WP 1bdb8116) — bir {@link OcrProvider}'ın ham çıktısı.
 *
 * <p>Sağlayıcı-bağımsız (provider-agnostic): hem Mindee'nin yapılandırılmış alan
 * çıktısı hem Tesseract'ın düz-metin çıktısı bu modele sığar. {@link OcrFieldExtractor}
 * bu ham çıktıyı belge tipine göre (fiş/çek/dekont) yapılandırılmış {@link OcrExtraction}'a
 * dönüştürür.</p>
 *
 * @param provider     üreten sağlayıcı adı ("mindee" | "tesseract")
 * @param rawText      tam ham metin (Tesseract dolu; Mindee'de opsiyonel)
 * @param fields       sağlayıcının verdiği yapılandırılmış alanlar (Mindee dolu)
 * @param overallScore 0.0–1.0 genel güven (null = bilinmiyor)
 * @param succeeded    sağlayıcı çağrısı başarılı oldu mu (degrade tespiti için)
 * @param errorMessage başarısızsa kısa neden (log/diagnostic; kullanıcıya gösterilmez ham)
 */
public record OcrRawResult(
        String provider,
        String rawText,
        List<OcrField> fields,
        Double overallScore,
        boolean succeeded,
        String errorMessage
) {

    public static OcrRawResult failure(String provider, String reason) {
        return new OcrRawResult(provider, null, List.of(), null, false, reason);
    }

    public static OcrRawResult textOnly(String provider, String rawText, Double score) {
        return new OcrRawResult(provider, rawText, List.of(), score, true, null);
    }

    public static OcrRawResult structured(String provider, String rawText,
                                          List<OcrField> fields, Double score) {
        return new OcrRawResult(provider, rawText,
                fields != null ? fields : List.of(), score, true, null);
    }

    /** Belirli bir alanı (varsa) getir. */
    public Optional<OcrField> field(String key) {
        return fields.stream().filter(f -> f.key().equalsIgnoreCase(key)).findFirst();
    }

    /** Alanları map'e indir (audit/persist için). */
    public Map<String, Object> toFieldMap() {
        List<OcrField> fs = fields != null ? fields : new ArrayList<>();
        var map = new java.util.LinkedHashMap<String, Object>();
        for (OcrField f : fs) {
            map.put(f.key(), Map.of(
                    "value", f.value() != null ? f.value() : "",
                    "confidence", f.confidence() != null ? f.confidence() : 0.0));
        }
        return map;
    }
}
