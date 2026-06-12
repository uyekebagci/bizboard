package com.bizboard.api.controller;

import com.bizboard.common.dto.ReminderDto;
import com.bizboard.common.dto.ReminderRequest;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.ReminderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Standalone hatırlatıcı CRUD.
 *
 * <p>Tüm uçlar authenticated kullanıcının KENDİ hatırlatıcıları üzerinde
 * çalışır — owner her zaman {@code principal.getId()}'den alınır, body/path'te
 * taşınmaz (cross-user erişim imkânsız). Yetki/erişim hataları
 * {@code GlobalExceptionHandler} ile 400/403'e map edilir.</p>
 */
@RestController
@RequestMapping("/reminders")
@RequiredArgsConstructor
public class ReminderController {

    private final ReminderService reminderService;

    /** Kullanıcının hatırlatıcıları (en yakın vade önce). */
    @GetMapping
    public ResponseEntity<List<ReminderDto>> list(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(reminderService.listForUser(principal.getId()));
    }

    /** Yeni hatırlatıcı oluştur. */
    @PostMapping
    public ResponseEntity<ReminderDto> create(
            @Valid @RequestBody ReminderRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        ReminderDto created = reminderService.create(principal.getId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /** Hatırlatıcıyı güncelle (yalnız sahibi). */
    @PutMapping("/{id}")
    public ResponseEntity<ReminderDto> update(
            @PathVariable UUID id,
            @Valid @RequestBody ReminderRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(reminderService.update(principal.getId(), id, request));
    }

    /** Hatırlatıcıyı sil (yalnız sahibi). */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal) {
        reminderService.delete(principal.getId(), id);
        return ResponseEntity.noContent().build();
    }
}
