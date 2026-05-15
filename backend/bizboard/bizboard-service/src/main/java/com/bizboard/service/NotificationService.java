package com.bizboard.service;

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

import java.util.List;
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
     * @param userId      kim alacak
     * @param type        seviye (INFO / WARNING / ALERT / SUCCESS)
     * @param title       başlık (kısa)
     * @param message     içerik (1-2 cümle)
     * @param actionUrl   tıklanınca gidilecek frontend rotası (örn. "/dashboard/transactions/{id}")
     * @param businessId  ilişkili işletme (opsiyonel)
     */
    @Transactional
    public NotificationDto create(UUID userId,
                                  NotificationType type,
                                  String title,
                                  String message,
                                  String actionUrl,
                                  UUID businessId) {
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
        log.debug("[notification] created id={} user={} type={}", n.getId(), userId, type);
        return toDto(n);
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
