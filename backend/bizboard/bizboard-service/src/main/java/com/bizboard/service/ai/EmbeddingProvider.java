package com.bizboard.service.ai;

import java.util.List;

/**
 * AI modülü (v1.1): embedding sağlayıcı soyutlaması (pluggable).
 *
 * <p>Anthropic embedding endpoint'i sunmaz; bu yüzden sağlayıcı dışarıdan
 * seçilir (Voyage AI — Anthropic-önerilen — veya OpenAI). Anahtar env'den gelir;
 * anahtar yoksa {@link #isAvailable()} false döner ve modül graceful kapanır.</p>
 */
public interface EmbeddingProvider {

    /** Sağlayıcı kimliği ("voyage" / "openai"). Config ile eşleşir. */
    String name();

    /** Anahtar set edilmiş ve sağlayıcı kullanılabilir mi. */
    boolean isAvailable();

    /** Kullanılan model id'si (kayıt için). */
    String model();

    /**
     * Bir grup metni embed eder; girdi sırasıyla aynı sırada vektör listesi döner.
     * Hata durumunda {@link EmbeddingException} fırlatır (servis non-fatal yakalar).
     */
    List<float[]> embed(List<String> texts);

    /** Tek metin kısa yolu. */
    default float[] embedOne(String text) {
        List<float[]> r = embed(List.of(text));
        return r.isEmpty() ? new float[0] : r.get(0);
    }

    /** Sağlayıcı/ağ hatası — çağıran tarafça non-fatal işlenir. */
    class EmbeddingException extends RuntimeException {
        public EmbeddingException(String message) { super(message); }
        public EmbeddingException(String message, Throwable cause) { super(message, cause); }
    }
}
