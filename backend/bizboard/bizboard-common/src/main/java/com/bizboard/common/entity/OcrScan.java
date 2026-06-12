package com.bizboard.common.entity;

import com.bizboard.common.enums.OcrScanStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * OCR Modülü (WP 1bdb8116) — taranan belge + çıkarılan alanlar (onay-öncesi durum).
 *
 * <p>Akış: dosya yüklenir → {@link FileUpload} kaydı oluşur → OCR çalışır →
 * çıkarılan alanlar (JSON) bu kayda yazılır (status=EXTRACTED/LOW_CONFIDENCE/FAILED)
 * → kullanıcı FE'de düzeltip onaylar → mevcut {@code TransactionService} ya da
 * {@code InstrumentService} ile finansal kayıt oluşturulur (status=CONFIRMED,
 * {@code resultEntityId} doldurulur). Bu entity finansal mantık taşımaz; sadece
 * tarama/onay state'ini izler.</p>
 *
 * <p>v2.0.0'da Flyway'e taşınınca {@code ddl-auto=update} bağımlılığı kalkar;
 * şema additive — mevcut tablolar etkilenmez.</p>
 */
@Entity
@Table(name = "ocr_scans", indexes = {
        @Index(name = "idx_ocr_scan_business_status", columnList = "business_id, status"),
        @Index(name = "idx_ocr_scan_file", columnList = "file_id"),
        @Index(name = "idx_ocr_scan_created", columnList = "business_id, created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OcrScan {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_id", nullable = false)
    private Business business;

    /** Yüklenen dosya (görüntü/PDF). Görüntüleme için {@code /files/{id}} ile servis edilir. */
    @Column(name = "file_id")
    private UUID fileId;

    /** Belge türü: RECEIPT | CHECK | PROMISSORY_NOTE | BANK_STATEMENT. */
    @Column(name = "document_type", nullable = false, length = 24)
    private String documentType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private OcrScanStatus status = OcrScanStatus.EXTRACTED;

    /** OCR'ı üreten sağlayıcı ("mindee" | "tesseract" | "none"). */
    @Column(name = "ocr_provider", length = 20)
    private String ocrProvider;

    /** Genel güven 0.0–1.0 (null = bilinmiyor). */
    @Column(name = "overall_confidence")
    private Double overallConfidence;

    /** Çıkarılan alanlar — JSON dizi [{key,value,confidence}]. FE bunu düzenlenebilir gösterir. */
    @Column(name = "extracted_fields", columnDefinition = "TEXT")
    private String extractedFields;

    /** Onay/diagnostic notu (ör. "Bazı alanların güveni düşük"). */
    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    /** Onaylandığında oluşturulan kaydın tipi: TRANSACTION | INSTRUMENT. */
    @Column(name = "result_entity_type", length = 20)
    private String resultEntityType;

    /** Onaylandığında oluşturulan kaydın id'si. */
    @Column(name = "result_entity_id")
    private UUID resultEntityId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @Column(name = "confirmed_at")
    private LocalDateTime confirmedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
