package com.bizboard.api.controller;

import com.bizboard.common.dto.NotificationDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.NotificationService;
import com.bizboard.service.NotificationService.AccessDeniedException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * In-app notifications. Tüm endpoint'ler authenticated kullanıcının kendi
 * bildirimleri üzerinde işlem yapar — başka kullanıcının bildirimine erişim
 * mümkün değil (markRead'de owner check var).
 */
@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    /** Son N bildirim. Default 20, max 100. */
    @GetMapping
    public ResponseEntity<List<NotificationDto>> list(
            @RequestParam(value = "size", defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(notificationService.listForUser(principal.getId(), size));
    }

    /** Okunmamış sayısı (header bell badge için). */
    @GetMapping("/unread-count")
    public ResponseEntity<Map<String, Long>> unreadCount(@AuthenticationPrincipal UserPrincipal principal) {
        long count = notificationService.countUnread(principal.getId());
        return ResponseEntity.ok(Map.of("count", count));
    }

    /** Tek bildirimi okundu işaretle. */
    @PatchMapping("/{id}/read")
    public ResponseEntity<?> markRead(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        try {
            NotificationDto dto = notificationService.markRead(id, principal.getId());
            return ResponseEntity.ok(dto);
        } catch (AccessDeniedException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("code", "AUTH-403", "message", "Bu bildirime erisim yok"));
        }
    }

    /** Kullanıcının tüm okunmamışlarını okundu işaretle. */
    @PatchMapping("/read-all")
    public ResponseEntity<Map<String, Integer>> markAllRead(@AuthenticationPrincipal UserPrincipal principal) {
        int updated = notificationService.markAllRead(principal.getId());
        return ResponseEntity.ok(Map.of("updated", updated));
    }
}
