package com.bizboard.service.ocr;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * OCR Modülü (WP 1bdb8116) — Tesseract yerel sağlayıcı (FALLBACK).
 *
 * <p>Mindee kullanılamadığında (key yok / hata) devreye girer. {@code tesseract}
 * binary'sini bir alt-process olarak çağırır, düz metin üretir; alan çıkarımı
 * {@link OcrFieldExtractor} tarafından regex/heuristik ile yapılır (Tesseract
 * yapılandırılmış alan vermez, sadece metin).</p>
 *
 * <p><b>OPS NOTU (deploy):</b> tesseract binary + dil paketleri
 * ({@code tesseract-ocr}, {@code tesseract-ocr-tur}) deploy imajında KURULU
 * olmalı. Kurulu değilse {@link #isAvailable()} false döner ve OCR graceful
 * şekilde "metin çıkarılamadı" durumuna düşer (uygulama çökmez).</p>
 *
 * <p><b>STRICT:</b> exception sızdırmaz; başarısızlık {@link OcrRawResult#failure}.</p>
 */
@Slf4j
@Component
public class TesseractOcrProvider implements OcrProvider {

    private static final String NAME = "tesseract";

    private final OcrProperties props;
    /** Binary varlık kontrolü cache'i (her scan'de probe etmemek için). */
    private final AtomicReference<Boolean> availableCache = new AtomicReference<>(null);

    public TesseractOcrProvider(OcrProperties props) {
        this.props = props;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean isAvailable() {
        Boolean cached = availableCache.get();
        if (cached != null) return cached;
        boolean ok = probeBinary();
        availableCache.set(ok);
        if (!ok) {
            log.warn("[ocr/tesseract] binary bulunamadı ({}). Fallback OCR devre dışı — "
                    + "deploy imajına tesseract-ocr + tesseract-ocr-tur kurun.",
                    props.getTesseract().getBinaryPath());
        }
        return ok;
    }

    @Override
    public OcrRawResult scan(byte[] fileBytes, String contentType, OcrDocumentType docType) {
        if (!isAvailable()) {
            return OcrRawResult.failure(NAME, "tesseract binary yok");
        }
        Path input = null;
        try {
            String suffix = suffixFor(contentType);
            input = Files.createTempFile("bizboard-ocr-", suffix);
            Files.write(input, fileBytes);

            // tesseract <input> stdout -l <langs> --psm 6
            ProcessBuilder pb = new ProcessBuilder(
                    props.getTesseract().getBinaryPath(),
                    input.toAbsolutePath().toString(),
                    "stdout",
                    "-l", props.getTesseract().getLanguages(),
                    "--psm", "6");
            pb.redirectErrorStream(false);
            Process proc = pb.start();

            String text = new String(proc.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            boolean finished = proc.waitFor(props.getTesseract().getTimeoutSeconds(), TimeUnit.SECONDS);
            if (!finished) {
                proc.destroyForcibly();
                return OcrRawResult.failure(NAME, "tesseract timeout");
            }
            if (proc.exitValue() != 0) {
                String err = new String(proc.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
                log.warn("[ocr/tesseract] exit={} err={}", proc.exitValue(), truncate(err));
                return OcrRawResult.failure(NAME, "tesseract exit " + proc.exitValue());
            }
            if (text.isBlank()) {
                return OcrRawResult.failure(NAME, "metin çıkarılamadı (boş)");
            }
            // Tesseract güven vermez; ham metin başarılı kabul edilir, düşük genel güven.
            return OcrRawResult.textOnly(NAME, text, 0.5);
        } catch (Exception e) {
            log.warn("[ocr/tesseract] çağrı hatası: {}", e.getMessage());
            return OcrRawResult.failure(NAME, "tesseract hata: " + e.getMessage());
        } finally {
            cleanup(input);
        }
    }

    private boolean probeBinary() {
        try {
            Process proc = new ProcessBuilder(props.getTesseract().getBinaryPath(), "--version")
                    .redirectErrorStream(true).start();
            boolean finished = proc.waitFor(5, TimeUnit.SECONDS);
            if (!finished) {
                proc.destroyForcibly();
                return false;
            }
            return proc.exitValue() == 0;
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return false;
        }
    }

    private static String suffixFor(String contentType) {
        if (contentType == null) return ".bin";
        if (contentType.contains("pdf")) return ".pdf";
        if (contentType.contains("png")) return ".png";
        if (contentType.contains("jpeg") || contentType.contains("jpg")) return ".jpg";
        if (contentType.contains("webp")) return ".webp";
        return ".bin";
    }

    private static void cleanup(Path p) {
        if (p == null) return;
        try {
            Files.deleteIfExists(p);
        } catch (IOException ignored) {
            // best-effort
        }
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > 300 ? s.substring(0, 300) + "…" : s;
    }
}
