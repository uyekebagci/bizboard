package com.bizboard.service.ocr;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * OCR Modülü (WP 1bdb8116) — konfigürasyon. Değerler {@code application.yml}'de
 * {@code app.ocr.*} altında, secret'lar ENV placeholder'ından ({@code ${MINDEE_API_KEY}})
 * gelir. <b>STRICT:</b> kodda literal key YOK.
 */
@Component
@ConfigurationProperties(prefix = "app.ocr")
@Getter
@Setter
public class OcrProperties {

    /** Modül açık mı. Kapalıysa controller 503 döner. */
    private boolean enabled = true;

    /** Birincil sağlayıcı: "mindee" | "tesseract". */
    private String provider = "mindee";

    /** Birincil başarısızsa otomatik fallback'e düş. */
    private boolean fallbackEnabled = true;

    /** Tek dosya üst sınırı (byte). OCR için varsayılan 8 MB. */
    private long maxFileSizeBytes = 8_388_608L;

    /** Bulk upload tek istekte azami dosya sayısı. */
    private int bulkMaxFiles = 20;

    private final Mindee mindee = new Mindee();
    private final Tesseract tesseract = new Tesseract();

    @Getter
    @Setter
    public static class Mindee {
        /** REST API anahtarı — ENV'den ({@code MINDEE_API_KEY}); BOŞSA Mindee devre dışı. */
        private String apiKey = "";
        /** Mindee API kök adresi. */
        private String baseUrl = "https://api.mindee.net/v1";
        /** Hesap adı (resmi modeller için "mindee"). */
        private String account = "mindee";
        /** Fiş/dekont modeli (expense_receipts). */
        private String receiptModel = "expense_receipts";
        /** Fiş/dekont model versiyonu. */
        private String receiptVersion = "5";
        /** Faturalar modeli (invoices). */
        private String invoiceModel = "invoices";
        private String invoiceVersion = "4";
        /** İstek timeout (sn). */
        private int timeoutSeconds = 25;

        public boolean isConfigured() {
            return apiKey != null && !apiKey.isBlank();
        }
    }

    @Getter
    @Setter
    public static class Tesseract {
        /** Tesseract binary yolu (deploy ortamında kurulu olmalı — OPS NOTU). */
        private String binaryPath = "tesseract";
        /** OCR dilleri (Türkçe + İngilizce; deploy'da {@code tur} traineddata gerekir). */
        private String languages = "tur+eng";
        /** Çağrı timeout (sn). */
        private int timeoutSeconds = 30;
    }
}
