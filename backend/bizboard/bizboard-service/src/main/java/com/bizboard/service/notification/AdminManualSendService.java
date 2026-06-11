package com.bizboard.service.notification;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.ManualNotificationRequest;
import com.bizboard.common.dto.ManualNotificationResult;
import com.bizboard.common.dto.NotificationMessage;
import com.bizboard.common.entity.NotificationChannelBinding;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationChannelType;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.common.enums.NotificationType;
import com.bizboard.repository.NotificationChannelBindingRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.AuditLogService;
import com.bizboard.service.NotificationService;
import com.bizboard.service.notification.telegram.TelegramClient;
import com.bizboard.service.notification.telegram.TelegramProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * MAN-1 (Telegram Admin Hedefli Gönderim): admin serbest metin/şablon bildirim
 * gönderimi. ADMIN-only (controller seviyesinde). Audit ZORUNLU.
 *
 * <p>Hedef tipleri (design §3.3):</p>
 * <ul>
 *   <li>{@code ALL_ADMINS}/{@code USERS} → seçilen kanal(lar)a (IN_APP/TELEGRAM/BOTH)
 *       DOĞRUDAN teslim. Admin manuel gönderimi KASITLIDIR — per-event preference
 *       bypass edilir, yalnız kanal seçimine + Telegram binding varlığına uyulur.</li>
 *   <li>{@code TELEGRAM_CHATS} → seçilen chat'lere DOĞRUDAN Telegram OUTBOUND
 *       (yalnız verified binding'lere).</li>
 * </ul>
 *
 * <p>GENERIC event etiketi in-app kayıtta korunur (mevcut altyapı reuse).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminManualSendService {

    private final NotificationChannelBindingRepository bindingRepository;
    private final UserRepository userRepository;
    private final TelegramClient telegramClient;
    private final TelegramProperties telegramProperties;
    private final NotificationService notificationService;
    private final AuditLogService auditLogService;

    private static final int TITLE_MAX = 200;
    private static final int BODY_MAX = 2000;

    /**
     * Manuel gönderim. Çağırmadan ÖNCE controller admin doğrulaması + rate-limit
     * yapmış olmalıdır.
     */
    @Transactional
    public ManualNotificationResult send(ManualNotificationRequest req,
                                         UUID adminUserId, String adminName) {
        String title = sanitize(req.getTitle(), TITLE_MAX);
        String body = sanitize(req.getBody(), BODY_MAX);
        if (body == null || body.isBlank()) {
            throw new IllegalArgumentException("Mesaj boş olamaz");
        }

        int dispatched = 0;
        List<ManualNotificationResult.TargetResult> telegramTargets = new ArrayList<>();
        int sent = 0;
        int failed = 0;

        switch (req.getRecipientType()) {
            case ALL_ADMINS -> {
                List<UUID> admins = userRepository.findByRoleIgnoreCase("admin").stream()
                        .map(User::getId).toList();
                if (admins.isEmpty()) throw new IllegalArgumentException("Admin kullanıcı bulunamadı");
                Counters c = deliverToUsers(admins, title, body, resolveChannel(req));
                dispatched = admins.size();
                sent += c.tgSent; failed += c.tgFailed;
                telegramTargets.addAll(c.targets);
            }
            case USERS -> {
                List<UUID> recipients = req.getRecipientIds() == null
                        ? List.of()
                        : req.getRecipientIds().stream().filter(Objects::nonNull).distinct().toList();
                if (recipients.isEmpty()) {
                    throw new IllegalArgumentException("En az bir alıcı seçmelisiniz");
                }
                Counters c = deliverToUsers(recipients, title, body, resolveChannel(req));
                dispatched = recipients.size();
                sent += c.tgSent; failed += c.tgFailed;
                telegramTargets.addAll(c.targets);
            }
            case TELEGRAM_CHATS -> {
                List<String> chatIds = req.getTelegramChatIds() == null
                        ? List.of()
                        : req.getTelegramChatIds().stream()
                            .filter(s -> s != null && !s.isBlank()).distinct().toList();
                if (chatIds.isEmpty()) {
                    throw new IllegalArgumentException("En az bir Telegram chat seçmelisiniz");
                }
                String html = buildHtml(title, body);
                for (String chatId : chatIds) {
                    // findByChannelAndExternalIdAndVerifiedTrue returns List to avoid
                    // IncorrectResultSizeDataAccessException: the same group chat can be
                    // bound by multiple users (unique constraint is on user_id+channel, not
                    // on channel+external_id). An empty list means unknown/unverified chat.
                    boolean verified = !bindingRepository
                            .findByChannelAndExternalIdAndVerifiedTrue(
                                    NotificationChannelType.TELEGRAM, chatId)
                            .isEmpty();
                    if (!verified) {
                        telegramTargets.add(target(chatId, "UNKNOWN_TARGET"));
                        failed++;
                        continue;
                    }
                    TelegramClient.SendResult r = telegramClient.sendMessage(chatId, html);
                    telegramTargets.add(target(chatId, mapResult(r)));
                    if (r == TelegramClient.SendResult.OK) sent++; else failed++;
                }
            }
            default -> throw new IllegalArgumentException("Geçersiz hedef tipi");
        }

        // Audit ZORUNLU — geri alınamaz işlem (design §3.3).
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("recipientType", req.getRecipientType().name());
        meta.put("channel", req.getChannel() != null ? req.getChannel().name() : null);
        meta.put("dispatchedRecipients", dispatched);
        meta.put("telegramSent", sent);
        meta.put("telegramFailed", failed);
        meta.put("titleLen", title != null ? title.length() : 0);
        meta.put("bodyLen", body.length());
        auditLogService.recordEntityAction(
                AuditAction.ADMIN_MANUAL_NOTIFICATION_SENT, adminUserId, adminName,
                "NOTIFICATION", null,
                "Manuel bildirim — hedef: " + req.getRecipientType()
                        + (title != null && !title.isBlank() ? " — " + title : ""),
                meta);

        return ManualNotificationResult.builder()
                .dispatchedRecipients(dispatched)
                .telegramSent(sent)
                .telegramFailed(failed)
                .telegramTargets(telegramTargets)
                .build();
    }

    /** Counter taşıyıcı (kullanıcı-bazlı teslim sonucu). */
    private static final class Counters {
        int tgSent;
        int tgFailed;
        final List<ManualNotificationResult.TargetResult> targets = new ArrayList<>();
    }

    /**
     * Kullanıcı listesine seçilen kanal(lar)a doğrudan teslim. IN_APP daima
     * notifications tablosuna yazar; TELEGRAM kullanıcının verified binding'ine
     * doğrudan gönderir (preference bypass — admin kasıtlı).
     */
    private Counters deliverToUsers(List<UUID> userIds, String title, String body,
                                    ManualNotificationRequest.Channel channel) {
        Counters c = new Counters();
        boolean wantInApp = channel == ManualNotificationRequest.Channel.IN_APP
                || channel == ManualNotificationRequest.Channel.BOTH;
        boolean wantTelegram = channel == ManualNotificationRequest.Channel.TELEGRAM
                || channel == ManualNotificationRequest.Channel.BOTH;

        String html = wantTelegram ? buildHtml(title, body) : null;
        // notifications.title NOT NULL — başlık verilmediyse makul varsayılan.
        String inAppTitle = (title != null && !title.isBlank()) ? title : "Bildirim";

        for (UUID userId : userIds) {
            if (userId == null) continue;
            if (wantInApp) {
                NotificationMessage msg = NotificationMessage.builder()
                        .recipientUserId(userId)
                        .event(NotificationEvent.GENERIC)
                        .type(NotificationType.INFO)
                        .title(inAppTitle)
                        .body(body)
                        .build();
                try {
                    notificationService.create(msg.getRecipientUserId(), msg.getType(),
                            msg.getTitle(), msg.getBody(), null, null, "event:GENERIC");
                } catch (Exception e) {
                    log.warn("[manual-send] in-app teslim hatası user={}: {}", userId, e.getMessage());
                }
            }
            if (wantTelegram && telegramProperties.isConfigured()) {
                NotificationChannelBinding b = bindingRepository
                        .findByUserIdAndChannel(userId, NotificationChannelType.TELEGRAM)
                        .orElse(null);
                if (b != null && b.isVerified()
                        && b.getExternalId() != null && !b.getExternalId().isBlank()) {
                    TelegramClient.SendResult r = telegramClient.sendMessage(b.getExternalId(), html);
                    c.targets.add(target(b.getExternalId(), mapResult(r)));
                    if (r == TelegramClient.SendResult.OK) c.tgSent++; else c.tgFailed++;
                }
            }
        }
        return c;
    }

    private ManualNotificationRequest.Channel resolveChannel(ManualNotificationRequest req) {
        return req.getChannel() != null ? req.getChannel() : ManualNotificationRequest.Channel.IN_APP;
    }

    private static ManualNotificationResult.TargetResult target(String chatId, String status) {
        return ManualNotificationResult.TargetResult.builder()
                .chatId(chatId).status(status).build();
    }

    private static String mapResult(TelegramClient.SendResult r) {
        return switch (r) {
            case OK -> "OK";
            case FORBIDDEN -> "FORBIDDEN";
            case RATE_LIMITED -> "RATE_LIMITED";
            case NOT_CONFIGURED -> "NOT_CONFIGURED";
            case TRANSIENT_ERROR -> "ERROR";
        };
    }

    private static String buildHtml(String title, String body) {
        StringBuilder sb = new StringBuilder();
        if (title != null && !title.isBlank()) {
            sb.append("<b>").append(escape(title)).append("</b>\n");
        }
        sb.append(escape(body));
        return sb.toString();
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String sanitize(String s, int max) {
        if (s == null) return null;
        String trimmed = s.strip();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }
}
