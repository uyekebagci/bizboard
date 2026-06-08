package com.bizboard.api.controller;

import com.bizboard.common.dto.NotificationPreferenceDto;
import com.bizboard.common.entity.NotificationPreference;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.notification.NotificationPreferenceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * WP f1fa3cd5: Kullanıcının bildirim tercihleri.
 *
 * <p>Tüm uçlar authenticated kullanıcının KENDİ tercihleri üzerinde çalışır —
 * userId her zaman {@code principal.getId()}'den alınır, body/path'te taşınmaz
 * (cross-user erişim imkânsız).</p>
 */
@RestController
@RequestMapping("/notifications/preferences")
@RequiredArgsConstructor
public class NotificationPreferenceController {

    private final NotificationPreferenceService preferenceService;

    /** Kullanıcının kayıtlı tercihleri (kayıt yoksa boş liste → varsayılanlar geçerli). */
    @GetMapping
    public ResponseEntity<List<NotificationPreferenceDto>> list(
            @AuthenticationPrincipal UserPrincipal principal) {
        List<NotificationPreferenceDto> out = preferenceService.listForUser(principal.getId())
                .stream().map(NotificationPreferenceController::toDto).toList();
        return ResponseEntity.ok(out);
    }

    /** Tercih upsert (event+channel → enabled). Kullanıcı yalnız kendi tercihini set eder. */
    @PutMapping
    public ResponseEntity<NotificationPreferenceDto> set(
            @Valid @RequestBody NotificationPreferenceDto request,
            @AuthenticationPrincipal UserPrincipal principal) {
        NotificationPreference saved = preferenceService.setPreference(
                principal.getId(), request.getEvent(), request.getChannel(), request.isEnabled());
        return ResponseEntity.ok(toDto(saved));
    }

    private static NotificationPreferenceDto toDto(NotificationPreference p) {
        return NotificationPreferenceDto.builder()
                .event(p.getEvent())
                .channel(p.getChannel())
                .enabled(p.isEnabled())
                .build();
    }
}
