package com.bizboard.service.ocr;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * OCR Modülü (WP 1bdb8116) — Mindee REST sağlayıcısı (BİRİNCİL).
 *
 * <p>Mindee Document Parsing API'sine multipart upload yapar
 * ({@code POST /products/{account}/{model}/v{version}/predict}),
 * {@code Authorization: Token <key>} header'ı ile. Anahtar
 * {@code app.ocr.mindee.api-key} (ENV {@code MINDEE_API_KEY}) boşsa
 * {@link #isAvailable()} false döner ve {@link OcrEngine} fallback'e geçer.</p>
 *
 * <p><b>STRICT:</b> hiçbir koşulda exception sızdırmaz — başarısızlık
 * {@link OcrRawResult#failure} ile döner (graceful degrade).</p>
 */
@Slf4j
@Component
public class MindeeOcrProvider implements OcrProvider {

    private static final String NAME = "mindee";

    private final OcrProperties props;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient http;

    public MindeeOcrProvider(OcrProperties props) {
        this.props = props;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .build();
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean isAvailable() {
        return props.getMindee().isConfigured();
    }

    @Override
    public OcrRawResult scan(byte[] fileBytes, String contentType, OcrDocumentType docType) {
        if (!isAvailable()) {
            return OcrRawResult.failure(NAME, "MINDEE_API_KEY tanımlı değil");
        }
        try {
            String url = buildUrl(docType);
            String boundary = "----bizboardOcr" + System.nanoTime();
            byte[] body = multipartBody(boundary, fileBytes, filenameFor(contentType));

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(props.getMindee().getTimeoutSeconds()))
                    .header("Authorization", "Token " + props.getMindee().getApiKey())
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                    .build();

            HttpResponse<String> resp = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() < 200 || resp.statusCode() >= 300) {
                log.warn("[ocr/mindee] HTTP {} — {}", resp.statusCode(), truncate(resp.body()));
                return OcrRawResult.failure(NAME, "Mindee HTTP " + resp.statusCode());
            }
            return parse(resp.body(), docType);
        } catch (Exception e) {
            log.warn("[ocr/mindee] çağrı hatası: {}", e.getMessage());
            return OcrRawResult.failure(NAME, "Mindee hata: " + e.getMessage());
        }
    }

    // ── Mindee response parsing ──────────────────────────────────────────────

    /**
     * Mindee yanıt şeması: {@code document.inference.prediction.<field>}.
     * Her alan {@code {value, confidence}} taşır; bu da field-level confidence'a
     * doğrudan eşlenir.
     */
    private OcrRawResult parse(String json, OcrDocumentType docType) {
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode prediction = root.path("document").path("inference").path("prediction");
            if (prediction.isMissingNode() || prediction.isEmpty()) {
                return OcrRawResult.failure(NAME, "Mindee prediction boş");
            }
            List<OcrField> fields = new ArrayList<>();
            double scoreSum = 0;
            int scoreCount = 0;

            // Ortak/fiş alanları
            scoreCount += addField(prediction, fields, "total_amount", "amount");
            scoreCount += addField(prediction, fields, "total_incl", "amount");
            scoreCount += addField(prediction, fields, "total_net", "net_amount");
            scoreCount += addField(prediction, fields, "date", "date");
            scoreCount += addField(prediction, fields, "due_date", "due_date");
            scoreCount += addField(prediction, fields, "supplier_name", "vendor");
            scoreCount += addField(prediction, fields, "supplier", "vendor");

            // KDV (taxes dizisi → ilk vergi oranı/tutarı)
            JsonNode taxes = prediction.path("taxes");
            if (taxes.isArray() && taxes.size() > 0) {
                JsonNode t = taxes.get(0);
                fields.add(OcrField.of("vat_amount",
                        text(t.path("value")), confidence(t)));
                fields.add(OcrField.of("vat_rate",
                        text(t.path("rate")), confidence(t)));
            }

            for (OcrField f : fields) {
                if (f.confidence() != null) {
                    scoreSum += f.confidence();
                }
            }
            Double overall = scoreCount > 0 ? scoreSum / scoreCount : null;
            return OcrRawResult.structured(NAME, null, fields, overall);
        } catch (Exception e) {
            log.warn("[ocr/mindee] parse hatası: {}", e.getMessage());
            return OcrRawResult.failure(NAME, "Mindee parse hatası");
        }
    }

    /** Mindee tek-değerli alanı ekle. Eklendiyse 1, yoksa 0 döner (skor sayımı). */
    private int addField(JsonNode prediction, List<OcrField> out, String mindeeKey, String logicalKey) {
        JsonNode node = prediction.path(mindeeKey);
        if (node.isMissingNode() || node.isNull()) return 0;
        String value = text(node.path("value"));
        if (value == null || value.isBlank()) return 0;
        // Aynı mantıksal anahtar zaten doluysa (ör. total_amount geldi) tekrar ekleme.
        boolean exists = out.stream().anyMatch(f -> f.key().equals(logicalKey) && f.hasValue());
        if (exists) return 0;
        out.add(OcrField.of(logicalKey, value, confidence(node)));
        return 1;
    }

    private static Double confidence(JsonNode node) {
        JsonNode c = node.path("confidence");
        return c.isNumber() ? c.asDouble() : null;
    }

    private static String text(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        return node.asText(null);
    }

    // ── HTTP helpers ─────────────────────────────────────────────────────────

    private String buildUrl(OcrDocumentType docType) {
        OcrProperties.Mindee m = props.getMindee();
        String model;
        String version;
        // Fiş/çek/senet → expense_receipts; banka dekontu → invoices (en yakın resmi model).
        if (docType == OcrDocumentType.BANK_STATEMENT) {
            model = m.getInvoiceModel();
            version = m.getInvoiceVersion();
        } else {
            model = m.getReceiptModel();
            version = m.getReceiptVersion();
        }
        return String.format("%s/products/%s/%s/v%s/predict",
                stripTrailingSlash(m.getBaseUrl()), m.getAccount(), model, version);
    }

    private static byte[] multipartBody(String boundary, byte[] fileBytes, String filename) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        String header = "--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"document\"; filename=\"" + filename + "\"\r\n"
                + "Content-Type: application/octet-stream\r\n\r\n";
        String footer = "\r\n--" + boundary + "--\r\n";
        try {
            out.write(header.getBytes(StandardCharsets.UTF_8));
            out.write(fileBytes);
            out.write(footer.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new RuntimeException("multipart oluşturulamadı", e);
        }
        return out.toByteArray();
    }

    private static String filenameFor(String contentType) {
        if (contentType == null) return "document.bin";
        if (contentType.contains("pdf")) return "document.pdf";
        if (contentType.contains("png")) return "document.png";
        if (contentType.contains("jpeg") || contentType.contains("jpg")) return "document.jpg";
        if (contentType.contains("webp")) return "document.webp";
        return "document.bin";
    }

    private static String stripTrailingSlash(String s) {
        if (s == null) return "";
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > 300 ? s.substring(0, 300) + "…" : s;
    }
}
