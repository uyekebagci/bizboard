package com.bizboard.service.notification.telegram;

import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Telegram bot MVP: env'den okunan konfigürasyon. SECRET REPO'DA TUTULMAZ —
 * yalnız env değişkeni placeholder'ları:
 *
 * <ul>
 *   <li>{@code APP_NOTIFICATIONS_TELEGRAM_BOT_TOKEN} — bot API token'ı</li>
 *   <li>{@code APP_NOTIFICATIONS_TELEGRAM_BOT_USERNAME} — deep-link için (@ siz)</li>
 *   <li>{@code APP_NOTIFICATIONS_TELEGRAM_WEBHOOK_SECRET} — webhook header doğrulama</li>
 * </ul>
 *
 * <p>Token boşsa kanal {@code isEnabled()=false} → dispatch sessizce atlar.</p>
 */
@Getter
@Component
public class TelegramProperties {

    private final String botToken;
    private final String botUsername;
    private final String webhookSecret;

    public TelegramProperties(
            @Value("${app.notifications.telegram.bot-token:}") String botToken,
            @Value("${app.notifications.telegram.bot-username:}") String botUsername,
            @Value("${app.notifications.telegram.webhook-secret:}") String webhookSecret) {
        this.botToken = botToken;
        this.botUsername = botUsername;
        this.webhookSecret = webhookSecret;
    }

    public boolean isConfigured() {
        return botToken != null && !botToken.isBlank();
    }
}
