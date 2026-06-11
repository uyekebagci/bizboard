package com.bizboard.api.controller;

import com.bizboard.common.dto.ManualNotificationRequest;
import com.bizboard.common.dto.ManualNotificationResult;
import com.bizboard.common.dto.TelegramChatDto;
import com.bizboard.common.dto.TelegramChatEventPrefDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.notification.AdminManualSendService;
import com.bizboard.service.notification.AdminNotificationRateLimiter;
import com.bizboard.service.notification.telegram.AdminTelegramService;
import com.bizboard.service.search.SearchRateLimiter;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Telegram Admin Hedefli Manuel Gönderim — admin uçları (CHT-1, CHT-2, MAN-1).
 *
 * <p>STRICT güvenlik: tüm uçlar {@code /admin/**} altında ({@code SecurityConfig}
 * → {@code hasRole("ADMIN")}) VE ayrıca {@code principal.isAdmin()} ile çift
 * kontrol edilir (belt-and-suspenders). MAN-1 rate-limit + zorunlu audit
 * (servis katmanında) uygular.</p>
 *
 * <ul>
 *   <li>CHT-1: {@code GET  /admin/notifications/telegram/chats}</li>
 *   <li>CHT-2: {@code GET  /admin/notifications/telegram/chats/{bindingId}/preferences}</li>
 *   <li>CHT-2: {@code PUT  /admin/notifications/telegram/chats/{bindingId}/preferences}</li>
 *   <li>MAN-1: {@code POST /admin/notifications/manual-send}</li>
 * </ul>
 */
@RestController
@RequestMapping("/admin/notifications")
@RequiredArgsConstructor
public class AdminNotificationController {

    private final AdminTelegramService adminTelegramService;
    private final AdminManualSendService manualSendService;
    private final AdminNotificationRateLimiter rateLimiter;

    // ── CHT-1: bağlı chat listesi ────────────────────────────────────────────

    @GetMapping("/telegram/chats")
    public ResponseEntity<List<TelegramChatDto>> listChats(
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.ok(adminTelegramService.listConnectedChats());
    }

    // ── CHT-2: per-chat event tercihleri ─────────────────────────────────────

    @GetMapping("/telegram/chats/{bindingId}/preferences")
    public ResponseEntity<List<TelegramChatEventPrefDto>> listChatPreferences(
            @PathVariable UUID bindingId,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        return ResponseEntity.ok(adminTelegramService.listChatPreferences(bindingId));
    }

    @PutMapping("/telegram/chats/{bindingId}/preferences")
    public ResponseEntity<TelegramChatEventPrefDto> setChatPreference(
            @PathVariable UUID bindingId,
            @Valid @RequestBody TelegramChatEventPrefDto request,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        TelegramChatEventPrefDto saved = adminTelegramService.setChatPreference(
                bindingId, request.getEvent(), request.isEnabled(),
                principal.getId(), principal.getUsername());
        return ResponseEntity.ok(saved);
    }

    // ── MAN-1: manuel gönderim ───────────────────────────────────────────────

    @PostMapping("/manual-send")
    public ResponseEntity<ManualNotificationResult> manualSend(
            @Valid @RequestBody ManualNotificationRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        requireAdmin(principal);
        rateLimiter.checkManualSend(principal.getId());
        ManualNotificationResult result = manualSendService.send(
                request, principal.getId(), principal.getUsername());
        return ResponseEntity.ok(result);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** Belt-and-suspenders: SecurityConfig zaten /admin/** → ADMIN, ek savunma. */
    private static void requireAdmin(UserPrincipal principal) {
        if (principal == null || !principal.isAdmin()) {
            throw new SecurityException("Bu işlem için admin yetkisi gerekli");
        }
    }

    /** 429 — MAN-1 rate-limit (SearchController ile aynı sözleşme). */
    @ExceptionHandler(SearchRateLimiter.RateLimitExceededException.class)
    public ResponseEntity<Map<String, Object>> handleRateLimit(
            SearchRateLimiter.RateLimitExceededException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                .body(Map.of(
                        "code", "RATE-429",
                        "message", ex.getMessage(),
                        "retryAfterSeconds", ex.getRetryAfterSeconds()));
    }
}
