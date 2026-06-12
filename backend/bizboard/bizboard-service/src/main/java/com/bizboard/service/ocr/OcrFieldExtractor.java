package com.bizboard.service.ocr;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * OCR Modülü (WP 1bdb8116) — alan çıkarımı + field-level confidence.
 *
 * <p>İki giriş yolu:</p>
 * <ol>
 *   <li><b>Mindee (yapılandırılmış):</b> sağlayıcı zaten {value, confidence}'lı
 *       alanlar verdi → mantıksal anahtarlara normalize edilir (confidence korunur).</li>
 *   <li><b>Tesseract (düz metin):</b> ham metin üzerinde TR-odaklı regex/heuristik
 *       ile tutar/tarih/vade/banka/satıcı/KDV çıkarılır → tahmin edilen confidence
 *       atanır (regex kesinliğine göre).</li>
 * </ol>
 *
 * <p>Belge tipine göre çıkarılan alan seti:</p>
 * <ul>
 *   <li>{@code RECEIPT}: amount, date, vendor, vat_amount, vat_rate</li>
 *   <li>{@code CHECK / PROMISSORY_NOTE}: amount, due_date, bank_name, drawer, serial_no</li>
 *   <li>{@code BANK_STATEMENT}: amount, date, counterpart</li>
 * </ul>
 */
@Slf4j
@Component
public class OcrFieldExtractor {

    // TR para tutarı: 1.234,56 veya 1234,56 veya 1234.56
    private static final Pattern AMOUNT = Pattern.compile(
            "(?<!\\d)(\\d{1,3}(?:[.\\s]\\d{3})*(?:,\\d{2})|\\d+[.,]\\d{2})(?!\\d)");
    // TR tarih: 12.06.2026 / 12/06/2026 / 2026-06-12
    private static final Pattern DATE = Pattern.compile(
            "(\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})");
    private static final Pattern VAT_RATE = Pattern.compile(
            "%\\s*(\\d{1,2})|kdv[^0-9%]{0,6}(\\d{1,2})", Pattern.CASE_INSENSITIVE);
    private static final Pattern BANK_LINE = Pattern.compile(
            "([A-ZÇĞİÖŞÜ][\\wÇĞİÖŞÜçğıöşü ]*?(?:BANK|BANKASI|BANKAS))", Pattern.CASE_INSENSITIVE);
    private static final Pattern SERIAL = Pattern.compile(
            "(?:çek\\s*no|cek\\s*no|seri[ -]?no|no)[^0-9]{0,5}([0-9]{6,})", Pattern.CASE_INSENSITIVE);

    /**
     * Ham OCR çıktısını belge tipine göre yapılandır.
     */
    public OcrExtraction extract(OcrRawResult raw, OcrDocumentType docType) {
        if (raw == null || !raw.succeeded()) {
            String reason = raw != null ? raw.errorMessage() : "OCR sonucu yok";
            return new OcrExtraction(docType, raw != null ? raw.provider() : "none",
                    List.of(), null, false,
                    "OCR otomatik okuma başarısız (" + reason + "). Alanları manuel girin.");
        }
        // Mindee yapılandırılmış alan verdiyse onu kullan; aksi halde metinden çıkar.
        if (raw.fields() != null && !raw.fields().isEmpty()) {
            return fromStructured(raw, docType);
        }
        if (raw.rawText() != null && !raw.rawText().isBlank()) {
            return fromText(raw, docType);
        }
        return new OcrExtraction(docType, raw.provider(), List.of(), raw.overallScore(), true,
                "Belge okundu ancak alan çıkarılamadı. Manuel girin.");
    }

    // ── Mindee yapılandırılmış → normalize ────────────────────────────────────

    private OcrExtraction fromStructured(OcrRawResult raw, OcrDocumentType docType) {
        List<OcrField> out = new ArrayList<>();
        switch (docType) {
            case RECEIPT -> {
                copy(raw, out, "amount", "amount");
                copy(raw, out, "date", "date");
                copy(raw, out, "vendor", "vendor");
                copy(raw, out, "vat_amount", "vat_amount");
                copy(raw, out, "vat_rate", "vat_rate");
            }
            case CHECK, PROMISSORY_NOTE -> {
                copy(raw, out, "amount", "amount");
                copy(raw, out, "due_date", "due_date");
                // Mindee fiş modelinde tarih varsa keşide/vade adayı olarak göster.
                if (out.stream().noneMatch(f -> f.key().equals("due_date"))) {
                    copy(raw, out, "date", "due_date");
                }
                copy(raw, out, "vendor", "drawer");
            }
            case BANK_STATEMENT -> {
                copy(raw, out, "amount", "amount");
                copy(raw, out, "date", "date");
                copy(raw, out, "vendor", "counterpart");
            }
        }
        String note = noteFor(out, docType, raw.provider());
        return new OcrExtraction(docType, raw.provider(), out, raw.overallScore(), true, note);
    }

    private void copy(OcrRawResult raw, List<OcrField> out, String fromKey, String toKey) {
        raw.field(fromKey).filter(OcrField::hasValue).ifPresent(f ->
                out.add(OcrField.of(toKey, f.value(), f.confidence())));
    }

    // ── Tesseract düz metin → regex/heuristik ─────────────────────────────────

    private OcrExtraction fromText(OcrRawResult raw, OcrDocumentType docType) {
        String text = raw.rawText();
        List<OcrField> out = new ArrayList<>();

        // Tutar: en büyük para-benzeri token (toplam çoğunlukla en büyüktür).
        String amount = largestAmount(text);
        if (amount != null) out.add(OcrField.of("amount", amount, 0.6));

        // Tarih: ilk tarih.
        String date = firstMatch(DATE, text, 1);
        String dateKey = (docType == OcrDocumentType.CHECK
                || docType == OcrDocumentType.PROMISSORY_NOTE) ? "due_date" : "date";
        if (date != null) out.add(OcrField.of(dateKey, date, 0.55));

        switch (docType) {
            case RECEIPT -> {
                String vendor = firstNonEmptyLine(text);
                if (vendor != null) out.add(OcrField.of("vendor", vendor, 0.4));
                String vatRate = vatRate(text);
                if (vatRate != null) out.add(OcrField.of("vat_rate", vatRate, 0.5));
            }
            case CHECK, PROMISSORY_NOTE -> {
                String bank = firstMatch(BANK_LINE, text, 1);
                if (bank != null) out.add(OcrField.of("bank_name", bank.trim(), 0.5));
                String serial = firstMatch(SERIAL, text, 1);
                if (serial != null) out.add(OcrField.of("serial_no", serial, 0.5));
            }
            case BANK_STATEMENT -> {
                String cp = firstNonEmptyLine(text);
                if (cp != null) out.add(OcrField.of("counterpart", cp, 0.4));
            }
        }
        String note = noteFor(out, docType, raw.provider());
        return new OcrExtraction(docType, raw.provider(), out, raw.overallScore(), true, note);
    }

    private static String noteFor(List<OcrField> out, OcrDocumentType docType, String provider) {
        boolean low = out.stream().filter(OcrField::hasValue).anyMatch(OcrField::isLowConfidence);
        boolean empty = out.stream().noneMatch(OcrField::hasValue);
        if (empty) {
            return "Alan çıkarılamadı (" + provider + "). Tüm alanları manuel girin.";
        }
        if (low) {
            return "Bazı alanların güveni düşük (" + provider
                    + "). Lütfen onaylamadan önce kontrol edin.";
        }
        return "OCR ile okundu (" + provider + "). Onaylamadan önce gözden geçirin.";
    }

    // ── regex helpers ─────────────────────────────────────────────────────────

    private static String firstMatch(Pattern p, String text, int group) {
        Matcher m = p.matcher(text);
        if (m.find()) {
            for (int g = group; g <= m.groupCount(); g++) {
                if (m.group(g) != null) return m.group(g);
            }
            return m.group();
        }
        return null;
    }

    private static String largestAmount(String text) {
        Matcher m = AMOUNT.matcher(text);
        String best = null;
        double bestVal = -1;
        while (m.find()) {
            String token = m.group(1);
            double v = parseTrNumber(token);
            if (v > bestVal) {
                bestVal = v;
                best = token;
            }
        }
        return best;
    }

    private static double parseTrNumber(String token) {
        if (token == null) return -1;
        String t = token.replace(" ", "");
        // 1.234,56 → 1234.56 ; 1234.56 (zaten) → 1234.56
        if (t.contains(",")) {
            t = t.replace(".", "").replace(",", ".");
        }
        try {
            return Double.parseDouble(t);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    private static String vatRate(String text) {
        Matcher m = VAT_RATE.matcher(text);
        if (m.find()) {
            return m.group(1) != null ? m.group(1) : m.group(2);
        }
        return null;
    }

    private static String firstNonEmptyLine(String text) {
        for (String line : text.split("\\r?\\n")) {
            String t = line.trim();
            if (t.length() >= 3 && t.matches(".*[A-Za-zÇĞİÖŞÜçğıöşü].*")) {
                return t.length() > 80 ? t.substring(0, 80) : t;
            }
        }
        return null;
    }
}
