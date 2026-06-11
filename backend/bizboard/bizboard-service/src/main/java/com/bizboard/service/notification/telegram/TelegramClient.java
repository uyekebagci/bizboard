package com.bizboard.service.notification.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.Optional;

/**
 * Telegram Bot API ince istemci (Spring RestClient — yeni bağımlılık yok).
 *
 * <p>Yalnız {@code sendMessage} MVP için yeterli. Hata sınıflaması çağırana
 * {@link SendResult} ile döner: 403 (bot engellendi → binding pasifle),
 * 429 (rate-limit → sonraki tur), 5xx/network (geçici → log). Token boşsa
 * çağrı yapılmaz.</p>
 */
@Slf4j
@Component
public class TelegramClient {

    public enum SendResult { OK, FORBIDDEN, RATE_LIMITED, TRANSIENT_ERROR, NOT_CONFIGURED }

    private final TelegramProperties props;
    private final RestClient http = RestClient.builder()
            .baseUrl("https://api.telegram.org")
            .build();

    public TelegramClient(TelegramProperties props) {
        this.props = props;
    }

    /**
     * Bir chat'e HTML mesaj gönder. Best-effort — exception yutulur, sınıflanmış
     * sonuç döner.
     */
    public SendResult sendMessage(String chatId, String html) {
        if (!props.isConfigured()) return SendResult.NOT_CONFIGURED;
        try {
            http.post()
                    .uri("/bot{token}/sendMessage", props.getBotToken())
                    .body(Map.of(
                            "chat_id", chatId,
                            "text", html,
                            "parse_mode", "HTML",
                            "disable_web_page_preview", true))
                    .retrieve()
                    .toBodilessEntity();
            return SendResult.OK;
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            HttpStatusCode s = e.getStatusCode();
            if (s.value() == 403) {
                log.warn("[telegram] 403 forbidden chat={} — binding pasifleştirilecek", chatId);
                return SendResult.FORBIDDEN;
            }
            if (s.value() == 429) {
                log.warn("[telegram] 429 rate-limited chat={}", chatId);
                return SendResult.RATE_LIMITED;
            }
            log.warn("[telegram] 4xx chat={} status={}", chatId, s.value());
            return SendResult.TRANSIENT_ERROR;
        } catch (Exception e) {
            log.warn("[telegram] sendMessage hata chat={}: {}", chatId, e.getMessage());
            return SendResult.TRANSIENT_ERROR;
        }
    }

    /**
     * CHT-1: chat metadata (tip + ad) zenginleştirme. Best-effort —
     * başarısızlık {@code Optional.empty()} döner (liste yine çalışır).
     *
     * <p>{@code getChat} döner: {@code type} (private/group/supergroup/channel),
     * grup için {@code title}, DM için {@code first_name}+{@code last_name}/{@code username}.</p>
     */
    public Optional<ChatInfo> getChat(String chatId) {
        if (!props.isConfigured() || chatId == null || chatId.isBlank()) return Optional.empty();
        try {
            JsonNode body = http.post()
                    .uri("/bot{token}/getChat", props.getBotToken())
                    .body(Map.of("chat_id", chatId))
                    .retrieve()
                    .body(JsonNode.class);
            if (body == null || !body.path("ok").asBoolean(false)) return Optional.empty();
            JsonNode r = body.path("result");
            String type = r.path("type").asText("");
            String title = r.hasNonNull("title")
                    ? r.path("title").asText("")
                    : buildDmName(r);
            return Optional.of(new ChatInfo(type, title));
        } catch (Exception e) {
            log.debug("[telegram] getChat başarısız chat={}: {}", chatId, e.getMessage());
            return Optional.empty();
        }
    }

    /** DM için ad oluştur: first+last veya @username. */
    private static String buildDmName(JsonNode r) {
        String first = r.path("first_name").asText("");
        String last = r.path("last_name").asText("");
        String full = (first + " " + last).trim();
        if (!full.isBlank()) return full;
        String username = r.path("username").asText("");
        return username.isBlank() ? "" : "@" + username;
    }

    /** CHT-1: zenginleştirme sonucu — chat tipi ham Telegram değeri + görünen ad. */
    public record ChatInfo(String type, String title) {}
}
