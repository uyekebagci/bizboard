package com.bizboard.service.ai;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * AI modülü (v1.1): tüm AI konfigürasyonu tek noktadan. Değerler
 * {@code application.yml} {@code app.ai.*} altından, anahtarlar env'den
 * ({@code ${VAR}}) gelir — repoda LİTERAL key yoktur.
 *
 * <p><b>Graceful degrade:</b> anahtar boşsa ilgili sağlayıcı devre dışı
 * ({@code isLlmEnabled()/isEmbeddingEnabled()} false). Feature flag
 * {@code app.ai.enabled} DEFAULT-KAPALI — açıkça açılmadıkça hiçbir AI
 * davranışı tetiklenmez, app çökmez.</p>
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app.ai")
public class AiProperties {

    /** Modülün ana açma/kapama bayrağı. DEFAULT KAPALI. */
    private boolean enabled = false;

    private final Llm llm = new Llm();
    private final Embedding embedding = new Embedding();
    private final Rag rag = new Rag();
    private final Anomaly anomaly = new Anomaly();

    /** LLM (Claude) anahtarı set edilmiş mi? */
    public boolean isLlmEnabled() {
        return enabled && llm.getApiKey() != null && !llm.getApiKey().isBlank();
    }

    /** Embedding sağlayıcı anahtarı set edilmiş mi? */
    public boolean isEmbeddingEnabled() {
        return enabled && embedding.getApiKey() != null && !embedding.getApiKey().isBlank();
    }

    @Getter
    @Setter
    public static class Llm {
        /** Claude API anahtarı — env'den ($ANTHROPIC_API_KEY). Boşsa LLM kapalı. */
        private String apiKey = "";
        /** Anthropic Messages API endpoint. */
        private String baseUrl = "https://api.anthropic.com/v1/messages";
        /** Model id. Varsayılan: en yetenekli widely-released model. */
        private String model = "claude-opus-4-8";
        /** anthropic-version header. */
        private String anthropicVersion = "2023-06-01";
        /** Cevap için max token (streaming kullanmıyoruz; makul tut). */
        private int maxTokens = 1500;
        /** HTTP timeout (sn). */
        private int timeoutSeconds = 60;
    }

    @Getter
    @Setter
    public static class Embedding {
        /**
         * Sağlayıcı: "voyage" (Anthropic-önerilen) veya "openai".
         * Anthropic'in embedding endpoint'i YOKTUR; pluggable.
         */
        private String provider = "voyage";
        /** Embedding API anahtarı — env'den. Boşsa embedding kapalı (graceful). */
        private String apiKey = "";
        /** Voyage embedding endpoint. */
        private String voyageBaseUrl = "https://api.voyageai.com/v1/embeddings";
        /** OpenAI embedding endpoint. */
        private String openaiBaseUrl = "https://api.openai.com/v1/embeddings";
        /** Model — provider'a göre (voyage-3 / text-embedding-3-small). */
        private String model = "voyage-3";
        /** HTTP timeout (sn). */
        private int timeoutSeconds = 30;
        /** Tek seferde embed edilecek max metin (rate-limit dostu batch). */
        private int batchSize = 32;
    }

    @Getter
    @Setter
    public static class Rag {
        /** RAG sorgu özelliği açık mı (alt-bayrak). */
        private boolean enabled = true;
        /** Context'e alınacak en yakın kayıt sayısı. */
        private int topK = 8;
    }

    @Getter
    @Setter
    public static class Anomaly {
        /** Anomali tespit job'ı açık mı. DEFAULT KAPALI (spam-kaçın). */
        private boolean enabled = false;
        /** Cron (Europe/Istanbul). Varsayılan: her gün 07:15. */
        private String cron = "0 15 7 * * *";
        /** Bir giderin "anormal" sayılması için ortalamanın kaç katı (z-benzeri eşik). */
        private double stdevFactor = 3.0;
        /** Anomali değerlendirmesinde geriye bakılacak gün sayısı. */
        private int lookbackDays = 90;
        /** En az kaç gider örneği olmalı (istatistik anlamlılığı). */
        private int minSamples = 8;
    }
}
