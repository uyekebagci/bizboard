package com.bizboard.service.notification.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
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
     * Inline-keyboard butonlu HTML mesaj gönderir (onay akışı: Onayla/Reddet).
     * Başarılıysa gönderilen mesajın {@code message_id}'si döner (sonradan
     * düzenlemek için); başarısızsa boş.
     *
     * @param buttons satır-satır butonlar; her buton {@code [etiket, callback_data]}.
     */
    public Optional<Long> sendMessageWithButtons(String chatId, String html,
                                                 List<List<String[]>> buttons) {
        if (!props.isConfigured() || chatId == null || chatId.isBlank()) return Optional.empty();
        try {
            JsonNode body = http.post()
                    .uri("/bot{token}/sendMessage", props.getBotToken())
                    .body(Map.of(
                            "chat_id", chatId,
                            "text", html,
                            "parse_mode", "HTML",
                            "disable_web_page_preview", true,
                            "reply_markup", Map.of("inline_keyboard", toKeyboard(buttons))))
                    .retrieve()
                    .body(JsonNode.class);
            if (body == null || !body.path("ok").asBoolean(false)) return Optional.empty();
            long messageId = body.path("result").path("message_id").asLong(0L);
            return messageId > 0 ? Optional.of(messageId) : Optional.empty();
        } catch (Exception e) {
            log.warn("[telegram] sendMessageWithButtons hata chat={}: {}", chatId, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Var olan bir mesajın metnini günceller ve inline-keyboard'u kaldırır
     * (onay sonuçlanınca "işlendi" görünümü). Best-effort — sessiz başarısızlık.
     */
    public void editMessageText(String chatId, Long messageId, String html) {
        if (!props.isConfigured() || chatId == null || messageId == null) return;
        try {
            http.post()
                    .uri("/bot{token}/editMessageText", props.getBotToken())
                    .body(Map.of(
                            "chat_id", chatId,
                            "message_id", messageId,
                            "text", html,
                            "parse_mode", "HTML",
                            "disable_web_page_preview", true))
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.debug("[telegram] editMessageText başarısız chat={} msg={}: {}",
                    chatId, messageId, e.getMessage());
        }
    }

    /**
     * Buton tıklamasına anlık geri bildirim (Telegram istemcisinde toast).
     * {@code callback_query} 'i mutlaka cevaplamak gerekir yoksa istemci
     * "yükleniyor" döner. Best-effort.
     */
    public void answerCallbackQuery(String callbackQueryId, String text, boolean alert) {
        if (!props.isConfigured() || callbackQueryId == null || callbackQueryId.isBlank()) return;
        try {
            Map<String, Object> b = new java.util.HashMap<>();
            b.put("callback_query_id", callbackQueryId);
            if (text != null && !text.isBlank()) b.put("text", text);
            if (alert) b.put("show_alert", true);
            http.post()
                    .uri("/bot{token}/answerCallbackQuery", props.getBotToken())
                    .body(b)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.debug("[telegram] answerCallbackQuery başarısız id={}: {}",
                    callbackQueryId, e.getMessage());
        }
    }

    /** [[ {text, callback_data}, ... ], ...] Telegram inline_keyboard yapısına çevirir. */
    private static List<List<Map<String, String>>> toKeyboard(List<List<String[]>> buttons) {
        return buttons.stream()
                .map(row -> row.stream()
                        .map(b -> Map.of("text", b[0], "callback_data", b[1]))
                        .toList())
                .toList();
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
