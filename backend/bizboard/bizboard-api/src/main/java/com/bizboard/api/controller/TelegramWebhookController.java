package com.bizboard.api.controller;

import com.bizboard.service.notification.telegram.TelegramProperties;
import com.bizboard.service.notification.telegram.TelegramWebhookService;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Telegram bot MVP: bot update'lerini alan webhook. Spring Security'de
 * {@code permitAll} (Telegram auth header taşımaz) ANCAK her istekte
 * {@code X-Telegram-Bot-Api-Secret-Token} header'ı env
 * {@code APP_NOTIFICATIONS_TELEGRAM_WEBHOOK_SECRET} ile karşılaştırılır —
 * uymayan → 403. setWebhook çağrılırken bu secret {@code secret_token} olarak verilir.
 *
 * <p>Her zaman 200 döner (geçerli istekte) ki Telegram retry fırtınası olmasın;
 * işleme best-effort.</p>
 */
@Slf4j
@RestController
@RequestMapping("/telegram")
@RequiredArgsConstructor
public class TelegramWebhookController {

    private static final String SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

    private final TelegramWebhookService webhookService;
    private final TelegramProperties props;

    @PostMapping("/webhook")
    public ResponseEntity<Void> webhook(
            @RequestHeader(value = SECRET_HEADER, required = false) String secret,
            @RequestBody JsonNode update) {

        // Secret yapılandırılmamışsa webhook devre dışı (yanlış konfig → kabul etme).
        String expected = props.getWebhookSecret();
        if (expected == null || expected.isBlank() || !expected.equals(secret)) {
            log.warn("[telegram-webhook] geçersiz/eksik secret header — 403");
            return ResponseEntity.status(403).build();
        }
        webhookService.handleUpdate(update);
        return ResponseEntity.ok().build();
    }
}
