package com.bizboard.service.notification.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

/**
 * Telegram bot MVP: webhook update işleyici. Komutlar:
 * <ul>
 *   <li>{@code /start <kod>} — deep-link bağlama (kod çöz → binding doğrula)</li>
 *   <li>{@code /durum} — bağlantı durumu</li>
 *   <li>{@code /kapat} — TELEGRAM tercihlerini kapat + binding pasifle</li>
 *   <li>diğer metin → kısa yardım</li>
 * </ul>
 *
 * <p>Tüm yanıtlar {@link TelegramClient} ile bota gider. Best-effort; istisna
 * yutulur (webhook 200 dönmeli ki Telegram retry fırtınası olmasın).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TelegramWebhookService {

    private final TelegramLinkService linkService;
    private final TelegramClient client;

    /** Telegram update JSON'unu işle. Güvenlik (secret header) controller'da yapılır. */
    public void handleUpdate(JsonNode update) {
        try {
            JsonNode message = update.path("message");
            if (message.isMissingNode()) return; // MVP: yalnız text message
            String text = message.path("text").asText("").trim();
            String chatId = message.path("chat").path("id").asText("");
            if (chatId.isBlank()) return;

            if (text.startsWith("/start")) {
                handleStart(text, chatId);
            } else if (text.startsWith("/durum")) {
                handleStatus(chatId);
            } else if (text.startsWith("/kapat")) {
                handleDisable(chatId);
            } else {
                client.sendMessage(chatId, help());
            }
        } catch (Exception e) {
            log.warn("[telegram-webhook] update işleme hatası: {}", e.getMessage());
        }
    }

    private void handleStart(String text, String chatId) {
        String[] parts = text.split("\\s+", 2);
        if (parts.length < 2 || parts[1].isBlank()) {
            client.sendMessage(chatId,
                    "Bağlamak için ÇATI panelinde <b>Bildirim Ayarları → Telegram Bağla</b> "
                    + "bölümünden kod alın ve buraya gönderin.");
            return;
        }
        Optional<UUID> userId = linkService.redeemCode(parts[1].trim(), chatId);
        if (userId.isPresent()) {
            client.sendMessage(chatId,
                    "Bağlantı başarılı ✅\nArtık ÇATI bildirimleri bu sohbete gelecek. "
                    + "Kapatmak için /kapat yazabilirsiniz.");
        } else {
            client.sendMessage(chatId, "Geçersiz veya süresi dolmuş kod. Panelden yeni bir kod alın.");
        }
    }

    private void handleStatus(String chatId) {
        Optional<UUID> userId = linkService.userByChatId(chatId);
        if (userId.isEmpty()) {
            client.sendMessage(chatId, "Bu sohbet bir ÇATI hesabına bağlı değil. /start ile bağlayın.");
            return;
        }
        boolean linked = linkService.isLinked(userId.get());
        client.sendMessage(chatId,
                linked
                    ? "Durum: <b>Bağlı ✅</b>\nÇATI bildirimleri bu sohbete iletiliyor."
                    : "Durum: bağlantı pasif. /start &lt;kod&gt; ile yeniden bağlayın.");
    }

    private void handleDisable(String chatId) {
        Optional<UUID> userId = linkService.userByChatId(chatId);
        if (userId.isEmpty()) {
            client.sendMessage(chatId, "Bu sohbet bir ÇATI hesabına bağlı değil.");
            return;
        }
        linkService.disable(userId.get());
        client.sendMessage(chatId,
                "Telegram bildirimleri kapatıldı. Tekrar açmak için panelden yeni kod alıp /start yapın.");
    }

    private static String help() {
        return "ÇATI Bot komutları:\n"
                + "/start &lt;kod&gt; — hesabı bağla\n"
                + "/durum — bağlantı durumu\n"
                + "/kapat — bildirimleri kapat";
    }
}
