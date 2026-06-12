package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * OCR Modülü (WP 1bdb8116) — REST DTO'ları.
 *
 * <p>Yükleme → tarama → review/confirm akışının istek/yanıt sözleşmeleri.
 * snake_case ({@code @JsonProperty}) kodbazına uyumlu.</p>
 */
public final class OcrDtos {

    private OcrDtos() {}

    // ── Tek bir çıkarılan alan (FE düzenlenebilir + confidence göstergesi) ──
    @Data
    @Builder
    public static class FieldDto {
        /** Mantıksal anahtar: amount | date | due_date | vendor | drawer | bank_name | serial_no | vat_amount | vat_rate | counterpart */
        private String key;
        /** Ham değer (string; FE input). */
        private String value;
        /** 0.0–1.0 güven (null = bilinmiyor). */
        private Double confidence;
        /** Eşik altı mı (FE vurgular). */
        @JsonProperty("low_confidence")
        private boolean lowConfidence;
    }

    // ── Tarama sonucu (review ekranı modeli) ──
    @Data
    @Builder
    public static class ScanDto {
        private UUID id;
        @JsonProperty("file_id")
        private UUID fileId;
        @JsonProperty("file_url")
        private String fileUrl;
        @JsonProperty("document_type")
        private String documentType;
        private String status;
        @JsonProperty("ocr_provider")
        private String ocrProvider;
        @JsonProperty("overall_confidence")
        private Double overallConfidence;
        @JsonProperty("has_low_confidence")
        private boolean hasLowConfidence;
        private String note;
        private List<FieldDto> fields;
        @JsonProperty("result_entity_type")
        private String resultEntityType;
        @JsonProperty("result_entity_id")
        private UUID resultEntityId;
        @JsonProperty("created_at")
        private LocalDateTime createdAt;
        @JsonProperty("confirmed_at")
        private LocalDateTime confirmedAt;
    }

    // ── Bulk tarama yanıtı (kısmi başarı toleranslı) ──
    @Data
    @Builder
    public static class BulkScanResponse {
        private List<ScanDto> scans;
        @JsonProperty("failed_files")
        private List<String> failedFiles;
    }

    // ── Onay isteği: kullanıcı düzeltilmiş alanları gönderir ──
    @Data
    public static class ConfirmRequest {

        /**
         * Onay sonrası hedef: TRANSACTION (fiş/dekont) | INSTRUMENT (çek/senet).
         * Verilmezse scan'in document_type'ından türetilir.
         */
        @JsonProperty("target")
        private String target;

        // ── Ortak finansal alanlar (kullanıcı düzeltmiş) ──
        @NotNull(message = "amount zorunlu")
        private BigDecimal amount;

        private LocalDate date;

        private String description;

        // ── TRANSACTION (fiş/dekont) için ──
        /** "INCOME" | "EXPENSE" — fiş genelde EXPENSE. */
        private String direction;
        @JsonProperty("category_id")
        private UUID categoryId;
        @JsonProperty("payment_method")
        private String paymentMethod;
        @JsonProperty("bank_account_id")
        private UUID bankAccountId;
        @JsonProperty("target_counterpart_id")
        private UUID targetCounterpartId;

        // ── INSTRUMENT (çek/senet) için ──
        /** "CHECK" | "PROMISSORY_NOTE" — verilmezse scan'den. */
        @JsonProperty("instrument_type")
        private String instrumentType;
        /** "RECEIVED" (alacak) | "GIVEN" (borç). */
        @JsonProperty("instrument_direction")
        private String instrumentDirection;
        @JsonProperty("due_date")
        private LocalDate dueDate;
        @JsonProperty("bank_name")
        private String bankName;
        @JsonProperty("serial_no")
        private String serialNo;
        @JsonProperty("issuer_counterpart_id")
        private UUID issuerCounterpartId;
    }
}
