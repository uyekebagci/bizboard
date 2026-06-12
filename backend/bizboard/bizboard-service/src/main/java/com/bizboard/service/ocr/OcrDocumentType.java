package com.bizboard.service.ocr;

import java.util.Locale;

/**
 * OCR Modülü (WP 1bdb8116) — taranan belgenin türü.
 *
 * <p>Belge türü hem sağlayıcı endpoint seçimini (Mindee ürün modeli) hem de
 * alan çıkarım stratejisini ({@link OcrFieldExtractor}) ve onay sonrası hedef
 * servisi belirler:</p>
 * <ul>
 *   <li>{@link #RECEIPT} → fiş/dekont → {@code TransactionService.createTransaction}</li>
 *   <li>{@link #CHECK} / {@link #PROMISSORY_NOTE} → çek/senet → {@code InstrumentService.create}</li>
 *   <li>{@link #BANK_STATEMENT} → banka dekontu → satır(lar) (BankImport ile uyumlu)</li>
 * </ul>
 */
public enum OcrDocumentType {
    RECEIPT,
    CHECK,
    PROMISSORY_NOTE,
    BANK_STATEMENT;

    public static OcrDocumentType parse(String raw) {
        if (raw == null || raw.isBlank()) return RECEIPT;
        try {
            return valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                    "Geçersiz document_type: " + raw
                    + " — RECEIPT | CHECK | PROMISSORY_NOTE | BANK_STATEMENT");
        }
    }

    public boolean isInstrument() {
        return this == CHECK || this == PROMISSORY_NOTE;
    }
}
