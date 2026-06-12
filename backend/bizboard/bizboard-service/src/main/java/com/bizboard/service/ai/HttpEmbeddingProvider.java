package com.bizboard.service.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * AI modülü (v1.1): Voyage AI / OpenAI embedding sağlayıcısı, Java 21 yerleşik
 * {@link HttpClient} ile (kod tabanı deseni — bkz. {@code ExchangeRateService};
 * yeni HTTP kütüphanesi eklenmez).
 *
 * <p>Voyage ve OpenAI embedding API'leri neredeyse aynı şekle sahiptir
 * (POST {@code {model, input:[...]}} → {@code {data:[{embedding:[...]}]}}), bu
 * yüzden tek sınıf iki sağlayıcıyı da kapsar. Auth: ikisi de
 * {@code Authorization: Bearer <key>}.</p>
 *
 * <p>Anahtar env'den gelir ({@code app.ai.embedding.api-key} → ör.
 * {@code $AI_EMBEDDING_API_KEY}); boşsa {@link #isAvailable()} false ve modül
 * graceful kapanır.</p>
 */
@Slf4j
@Component
public class HttpEmbeddingProvider implements EmbeddingProvider {

    private final AiProperties props;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http;

    public HttpEmbeddingProvider(AiProperties props) {
        this.props = props;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .build();
    }

    @Override
    public String name() {
        return props.getEmbedding().getProvider();
    }

    @Override
    public boolean isAvailable() {
        return props.isEmbeddingEnabled();
    }

    @Override
    public String model() {
        return props.getEmbedding().getModel();
    }

    @Override
    public List<float[]> embed(List<String> texts) {
        if (!isAvailable()) {
            throw new EmbeddingException("Embedding provider disabled (no API key / feature off)");
        }
        if (texts == null || texts.isEmpty()) {
            return List.of();
        }

        List<float[]> out = new ArrayList<>(texts.size());
        int batch = Math.max(1, props.getEmbedding().getBatchSize());
        for (int i = 0; i < texts.size(); i += batch) {
            List<String> chunk = texts.subList(i, Math.min(i + batch, texts.size()));
            out.addAll(embedBatch(chunk));
        }
        return out;
    }

    private List<float[]> embedBatch(List<String> chunk) {
        AiProperties.Embedding cfg = props.getEmbedding();
        boolean openai = "openai".equalsIgnoreCase(cfg.getProvider());
        String url = openai ? cfg.getOpenaiBaseUrl() : cfg.getVoyageBaseUrl();

        ObjectNode body = mapper.createObjectNode();
        body.put("model", cfg.getModel());
        ArrayNode input = body.putArray("input");
        chunk.forEach(input::add);

        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(cfg.getTimeoutSeconds()))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + cfg.getApiKey())
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                throw new EmbeddingException("Embedding API " + resp.statusCode()
                        + " (" + cfg.getProvider() + "): " + truncate(resp.body()));
            }
            return parse(resp.body());
        } catch (EmbeddingException e) {
            throw e;
        } catch (Exception e) {
            throw new EmbeddingException("Embedding request failed (" + cfg.getProvider() + "): "
                    + e.getMessage(), e);
        }
    }

    /** Voyage ve OpenAI cevap şekli aynı: {@code {data:[{embedding:[...]}]}}. */
    private List<float[]> parse(String json) {
        try {
            JsonNode root = mapper.readTree(json);
            JsonNode data = root.path("data");
            List<float[]> vecs = new ArrayList<>();
            for (JsonNode item : data) {
                JsonNode emb = item.path("embedding");
                float[] v = new float[emb.size()];
                for (int j = 0; j < emb.size(); j++) {
                    v[j] = (float) emb.get(j).asDouble();
                }
                vecs.add(v);
            }
            if (vecs.isEmpty()) {
                throw new EmbeddingException("Embedding response had no vectors");
            }
            return vecs;
        } catch (EmbeddingException e) {
            throw e;
        } catch (Exception e) {
            throw new EmbeddingException("Failed to parse embedding response: " + e.getMessage(), e);
        }
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > 300 ? s.substring(0, 300) + "…" : s;
    }
}
