package com.bizboard.api.controller;

import com.bizboard.security.UserPrincipal;
import com.bizboard.service.notification.telegram.TelegramLinkService;
import com.bizboard.service.notification.telegram.TelegramProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Telegram bot MVP: kullanıcının KENDİ Telegram bağlantısı (auth'lı).
 *
 * <ul>
 *   <li>{@code POST /api/me/notifications/telegram/link-code} → tek-kullanımlık kod + deep-link</li>
 *   <li>{@code GET  /api/me/notifications/telegram/status} → bağlı mı + bot yapılandırılmış mı</li>
 * </ul>
 *
 * <p>Tüm uçlar {@code principal.getId()} ile yalnız kendi hesabına etki eder
 * (cross-user imkânsız). Kod yalnız bu kullanıcı için üretilir.</p>
 */
@RestController
@RequestMapping("/api/me/notifications/telegram")
@RequiredArgsConstructor
public class MeNotificationController {

    private final TelegramLinkService linkService;
    private final TelegramProperties props;

    @PostMapping("/link-code")
    public ResponseEntity<Map<String, Object>> linkCode(@AuthenticationPrincipal UserPrincipal principal) {
        if (!props.isConfigured() || props.getBotUsername() == null || props.getBotUsername().isBlank()) {
            // Bot henüz yapılandırılmamış (token/username yok) — net mesaj.
            return ResponseEntity.status(503).body(Map.of(
                    "message", "Telegram botu henüz yapılandırılmamış. Lütfen yöneticiyle iletişime geçin."));
        }
        TelegramLinkService.IssuedCode issued = linkService.createLinkCode(principal.getId());
        String deeplink = "https://t.me/" + props.getBotUsername() + "?start=" + issued.code();
        return ResponseEntity.ok(Map.of(
                "code", issued.code(),
                "deeplink", deeplink,
                "expiresAt", issued.expiresAt().toString()));
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(Map.of(
                "linked", linkService.isLinked(principal.getId()),
                "botConfigured", props.isConfigured()
                        && props.getBotUsername() != null && !props.getBotUsername().isBlank()));
    }

    @DeleteMapping("/link")
    public ResponseEntity<Map<String, Object>> unlink(@AuthenticationPrincipal UserPrincipal principal) {
        linkService.disable(principal.getId());
        return ResponseEntity.ok(Map.of("linked", false));
    }
}
