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

/**
 * AI modülü (v1.1): Anthropic Messages API ({@code POST /v1/messages}) istemcisi,
 * Java 21 yerleşik {@link HttpClient} ile (kod tabanı deseni; yeni bağımlılık yok).
 *
 * <p>İstek şekli: {@code {model, max_tokens, system, messages:[{role,content}]}}.
 * Header: {@code x-api-key}, {@code anthropic-version}, {@code content-type}.
 * Cevap: {@code {content:[{type:"text", text:...}], stop_reason, usage}}.</p>
 *
 * <p>Anahtar env'den ({@code app.ai.llm.api-key} → ör. {@code $ANTHROPIC_API_KEY}).
 * Anahtar yoksa {@link #isAvailable()} false; çağıran graceful davranır.
 * {@code stop_reason == "refusal"} olduğunda content boş olabilir — kontrol
 * edilir.</p>
 */
@Slf4j
@Component
public class ClaudeChatClient {

    private final AiProperties props;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http;

    public ClaudeChatClient(AiProperties props) {
        this.props = props;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .build();
    }

    public boolean isAvailable() {
        return props.isLlmEnabled();
    }

    /**
     * Tek-tur soru-cevap. {@code systemPrompt} davranışı, {@code userMessage}
     * kullanıcı sorusu (RAG context dahil) içerir.
     *
     * @return modelin metin cevabı; refusal/boş durumda kibar fallback.
     * @throws LlmException ağ/HTTP hatasında (çağıran non-fatal işler).
     */
    public String complete(String systemPrompt, String userMessage) {
        if (!isAvailable()) {
            throw new LlmException("LLM disabled (no API key / feature off)");
        }
        AiProperties.Llm cfg = props.getLlm();

        ObjectNode body = mapper.createObjectNode();
        body.put("model", cfg.getModel());
        body.put("max_tokens", cfg.getMaxTokens());
        if (systemPrompt != null && !systemPrompt.isBlank()) {
            body.put("system", systemPrompt);
        }
        ArrayNode messages = body.putArray("messages");
        ObjectNode userMsg = messages.addObject();
        userMsg.put("role", "user");
        userMsg.put("content", userMessage);

        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(cfg.getBaseUrl()))
                    .timeout(Duration.ofSeconds(cfg.getTimeoutSeconds()))
                    .header("content-type", "application/json")
                    .header("x-api-key", cfg.getApiKey())
                    .header("anthropic-version", cfg.getAnthropicVersion())
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                throw new LlmException("Claude API " + resp.statusCode() + ": " + truncate(resp.body()));
            }
            return parseText(resp.body());
        } catch (LlmException e) {
            throw e;
        } catch (Exception e) {
            throw new LlmException("Claude request failed: " + e.getMessage(), e);
        }
    }

    private String parseText(String json) {
        try {
            JsonNode root = mapper.readTree(json);
            String stopReason = root.path("stop_reason").asText("");
            if ("refusal".equals(stopReason)) {
                return "Bu soruyu güvenlik nedeniyle yanıtlayamıyorum.";
            }
            StringBuilder sb = new StringBuilder();
            for (JsonNode block : root.path("content")) {
                if ("text".equals(block.path("type").asText())) {
                    sb.append(block.path("text").asText());
                }
            }
            String text = sb.toString().trim();
            return text.isEmpty() ? "Şu an cevap üretemedim, lütfen tekrar deneyin." : text;
        } catch (Exception e) {
            throw new LlmException("Failed to parse Claude response: " + e.getMessage(), e);
        }
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > 400 ? s.substring(0, 400) + "…" : s;
    }

    /** LLM ağ/HTTP hatası — çağıran tarafça non-fatal işlenir. */
    public static class LlmException extends RuntimeException {
        public LlmException(String message) { super(message); }
        public LlmException(String message, Throwable cause) { super(message, cause); }
    }
}
