package com.bizboard.service.ocr;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * OCR Modülü (WP 1bdb8116) — belge tipine göre yapılandırılmış çıkarım sonucu.
 *
 * <p>{@link OcrFieldExtractor} ham {@link OcrRawResult}'ı belge tipine
 * (fiş/çek/dekont) göre normalize edilmiş bu modele dönüştürür. Her alan
 * {@link OcrField} olarak field-level confidence taşır; düşük güvenli alan(lar)
 * varsa {@link #hasLowConfidence()} true döner → FE onay adımında vurgular.</p>
 */
public class OcrExtraction {

    private final OcrDocumentType docType;
    private final String provider;
    private final List<OcrField> fields;
    private final Double overallScore;
    private final boolean ocrSucceeded;
    private final String note;

    public OcrExtraction(OcrDocumentType docType, String provider, List<OcrField> fields,
                         Double overallScore, boolean ocrSucceeded, String note) {
        this.docType = docType;
        this.provider = provider;
        this.fields = fields != null ? fields : new ArrayList<>();
        this.overallScore = overallScore;
        this.ocrSucceeded = ocrSucceeded;
        this.note = note;
    }

    public OcrDocumentType docType() { return docType; }
    public String provider() { return provider; }
    public List<OcrField> fields() { return fields; }
    public Double overallScore() { return overallScore; }
    public boolean ocrSucceeded() { return ocrSucceeded; }
    public String note() { return note; }

    public Optional<OcrField> field(String key) {
        return fields.stream().filter(f -> f.key().equalsIgnoreCase(key)).findFirst();
    }

    public String value(String key) {
        return field(key).map(OcrField::value).orElse(null);
    }

    /** En az bir dolu alan düşük güvenli mi (onay öncesi flag). */
    public boolean hasLowConfidence() {
        return fields.stream().filter(OcrField::hasValue).anyMatch(OcrField::isLowConfidence);
    }

    /** Hiçbir anlamlı alan çıkarılamadıysa true (tam manuel giriş gerekir). */
    public boolean isEmpty() {
        return fields.stream().noneMatch(OcrField::hasValue);
    }
}
