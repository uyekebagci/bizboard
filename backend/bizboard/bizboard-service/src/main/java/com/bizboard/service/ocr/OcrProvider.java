package com.bizboard.service.ocr;

/**
 * OCR Modülü (WP 1bdb8116) — sağlayıcı portu (hexagonal / strategy).
 *
 * <p>Sağlayıcı-pluggable: birden çok adapter implemente eder, {@code app.ocr.provider}
 * konfigürasyonuyla seçilir. Birincil sağlayıcı kullanılamazsa (key yok / hata)
 * {@link OcrEngine} otomatik fallback'e düşer.</p>
 *
 * <ul>
 *   <li>{@code mindee}    – {@link MindeeOcrProvider} (REST API; birincil)</li>
 *   <li>{@code tesseract} – {@link TesseractOcrProvider} (yerel binary; fallback)</li>
 * </ul>
 *
 * <p><b>STRICT:</b> implementasyonlar ASLA exception fırlatmaz — başarısızlığı
 * {@link OcrRawResult#failure} ile döndürür. Bu, graceful degrade + fallback
 * akışının sağlam çalışmasını garanti eder.</p>
 */
public interface OcrProvider {

    /** Konfigürasyonla eşleşen sağlayıcı kimliği ("mindee" | "tesseract"). */
    String name();

    /**
     * Sağlayıcı şu an çalışabilir durumda mı? (Mindee: key var mı; Tesseract:
     * binary var mı). {@code false} ise {@link OcrEngine} bu sağlayıcıyı atlar.
     */
    boolean isAvailable();

    /**
     * Bir belgeyi tara ve ham OCR çıktısı üret.
     *
     * @param fileBytes   belge gövdesi (görüntü ya da PDF)
     * @param contentType MIME tipi (ör. {@code image/png}, {@code application/pdf})
     * @param docType     belge türü (sağlayıcı endpoint/model seçimi için)
     * @return ham OCR sonucu; hata durumunda {@link OcrRawResult#succeeded()} = false
     */
    OcrRawResult scan(byte[] fileBytes, String contentType, OcrDocumentType docType);
}
