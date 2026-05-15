package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.NotificationDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Notification;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationType;
import com.bizboard.repository.NotificationRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Kullanıcı bildirim akışı (in-app notifications).
 *
 * <p>Endpoint'ler:</p>
 * <ul>
 *   <li>{@code listForUser} → GET /notifications</li>
 *   <li>{@code countUnread} → GET /notifications/unread-count</li>
 *   <li>{@code markRead}    → PATCH /notifications/{id}/read</li>
 *   <li>{@code markAllRead} → PATCH /notifications/read-all</li>
 * </ul>
 *
 * <p>Bildirim oluşturma (trigger'lar): {@link #create} backend'in herhangi
 * bir yerinden çağrılır — diğer servisler önemli olayda bunu çağırır.
 * Trigger listesi v1.2.0'da küçük başlıyor, ileride büyüyecek.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository repository;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;

    @Transactional(readOnly = true)
    public List<NotificationDto> listForUser(UUID userId, int size) {
        int clamped = Math.min(Math.max(size, 1), 100);
        return repository
                .findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, clamped))
                .stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public long countUnread(UUID userId) {
        return repository.countByUserIdAndReadFalse(userId);
    }

    /** Tek bildirimi okundu işaretle. Sadece bildirim sahibi yapabilir. */
    @Transactional
    public NotificationDto markRead(UUID notificationId, UUID requesterUserId) {
        Notification n = repository.findById(notificationId)
                .orElseThrow(() -> new IllegalArgumentException("Notification not found"));
        if (!n.getUser().getId().equals(requesterUserId)) {
            throw new AccessDeniedException();
        }
        if (!n.isRead()) {
            n.setRead(true);
            repository.save(n);
        }
        return toDto(n);
    }

    /** Kullanıcının tüm okunmamışlarını topluca okundu işaretle. */
    @Transactional
    public int markAllRead(UUID userId) {
        return repository.markAllReadForUser(userId);
    }

    // ── Trigger API — diğer servisler tarafından çağırılır ─────────────────

    /**
     * Yeni bildirim oluştur ve kaydet.
     *
     * <p>Bu metod ayrıca {@code NOTIFICATION_SENT} audit log kaydı düşer — kime ne
     * gönderildi, hangi trigger'ın tetiklediği. Audit kaydı best-effort'tur (REQUIRES_NEW);
     * audit hatası bildirim oluşumunu rollback etmez.</p>
     *
     * @param userId      kim alacak
     * @param type        seviye (INFO / WARNING / ALERT / SUCCESS)
     * @param title       başlık (kısa)
     * @param message     içerik (1-2 cümle)
     * @param actionUrl   tıklanınca gidilecek frontend rotası (örn. "/dashboard/transactions/{id}")
     * @param businessId  ilişkili işletme (opsiyonel)
     * @param trigger     bildirimi üreten kaynak kodu (örn. "first-login", "debt-due-soon");
     *                    audit metadata'sına düşer, forensic için. {@code null} verilebilir.
     */
    @Transactional
    public NotificationDto create(UUID userId,
                                  NotificationType type,
                                  String title,
                                  String message,
                                  String actionUrl,
                                  UUID businessId,
                                  String trigger) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        Notification n = Notification.builder()
                .user(user)
                .type(type)
                .title(title)
                .message(message)
                .actionUrl(actionUrl)
                .read(false)
                .build();

        if (businessId != null) {
            Business b = new Business();
            b.setId(businessId);
            n.setBusiness(b);
        }

        n = repository.save(n);
        log.debug("[notification] created id={} user={} type={} trigger={}",
                n.getId(), userId, type, trigger);

        Map<String, Object> meta = new HashMap<>();
        meta.put("recipientUserId", userId);
        meta.put("notificationId", n.getId());
        meta.put("type", type.name());
        if (trigger != null && !trigger.isBlank()) {
            meta.put("trigger", trigger);
        }
        if (businessId != null) {
            meta.put("businessId", businessId);
        }
        if (actionUrl != null && !actionUrl.isBlank()) {
            meta.put("actionUrl", actionUrl);
        }

        auditLogService.recordEntityAction(
                AuditAction.NOTIFICATION_SENT,
                // Alıcı kullanıcının username'i — bildirimi sistem ürettiği için ayrı bir
                // "actor" yok; resourceId notification id'si, userId/userName alıcıyı işaret eder.
                userId, user.getUsername(),
                "NOTIFICATION", n.getId(),
                user.getUsername() + " <- [" + type.name() + "] " + title
                        + (trigger != null ? " (trigger=" + trigger + ")" : ""),
                meta);

        return toDto(n);
    }

    /** Geriye uyumlu overload — trigger bilinmiyorsa. */
    @Transactional
    public NotificationDto create(UUID userId,
                                  NotificationType type,
                                  String title,
                                  String message,
                                  String actionUrl,
                                  UUID businessId) {
        return create(userId, type, title, message, actionUrl, businessId, null);
    }

    // ── helpers ────────────────────────────────────────────────────────────

    private NotificationDto toDto(Notification n) {
        return NotificationDto.builder()
                .id(n.getId())
                .type(n.getType())
                .title(n.getTitle())
                .message(n.getMessage())
                .read(n.isRead())
                .actionUrl(n.getActionUrl())
                .businessId(n.getBusiness() != null ? n.getBusiness().getId() : null)
                .businessName(n.getBusiness() != null ? n.getBusiness().getName() : null)
                .createdAt(n.getCreatedAt())
                .build();
    }

    public static class AccessDeniedException extends RuntimeException {
        public AccessDeniedException() { super("forbidden"); }
    }
}
