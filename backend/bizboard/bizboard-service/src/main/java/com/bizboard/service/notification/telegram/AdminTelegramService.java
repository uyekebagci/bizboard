package com.bizboard.service.notification.telegram;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.TelegramChatDto;
import com.bizboard.common.dto.TelegramChatEventPrefDto;
import com.bizboard.common.entity.NotificationChannelBinding;
import com.bizboard.common.entity.TelegramChatEventPreference;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationChannelType;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.repository.NotificationChannelBindingRepository;
import com.bizboard.repository.TelegramChatEventPreferenceRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.AuditLogService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * CHT-1 + CHT-2 (Telegram Admin Hedefli Gönderim): admin-tarafı bağlı chat
 * görünürlüğü + per-chat event tercihi. ADMIN-only (controller {@code /admin/**}
 * + {@code principal.isAdmin()} ile korunur).
 *
 * <p>Per-chat tercih modeli GRP-3 ile TEK model — {@link TelegramChatEventPreference}.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminTelegramService {

    private final NotificationChannelBindingRepository bindingRepository;
    private final TelegramChatEventPreferenceRepository prefRepository;
    private final UserRepository userRepository;
    private final TelegramClient client;
    private final TelegramProperties props;
    private final AuditLogService auditLogService;

    private static final int TOTAL_EVENTS = NotificationEvent.values().length;

    // ── CHT-1: bağlı chat listesi ────────────────────────────────────────────

    /**
     * Bağlı (verified) Telegram chat'leri admin görünümünde döner. Telegram
     * getChat ile tip/ad zenginleştirilir (best-effort). N+1 getChat çağrısı
     * binding sayısı küçük olduğundan MVP için kabul edilebilir.
     */
    @Transactional(readOnly = true)
    public List<TelegramChatDto> listConnectedChats() {
        List<NotificationChannelBinding> bindings =
                bindingRepository.findByChannelAndVerifiedTrue(NotificationChannelType.TELEGRAM);

        // Kullanıcıları tek seferde çek (N+1 önle).
        Map<UUID, User> usersById = new HashMap<>();
        for (User u : userRepository.findAllById(
                bindings.stream().map(NotificationChannelBinding::getUserId).toList())) {
            usersById.put(u.getId(), u);
        }

        List<TelegramChatDto> out = new ArrayList<>(bindings.size());
        for (NotificationChannelBinding b : bindings) {
            String chatId = b.getExternalId();
            if (chatId == null || chatId.isBlank()) continue;

            TelegramClient.ChatInfo info = props.isConfigured()
                    ? client.getChat(chatId).orElse(null) : null;
            String chatType = normalizeType(info != null ? info.type() : null);
            String chatName = (info != null && info.title() != null && !info.title().isBlank())
                    ? info.title() : "(isim alınamadı)";

            User u = usersById.get(b.getUserId());
            int enabled = (int) prefRepository.findByBindingId(b.getId()).stream()
                    .filter(TelegramChatEventPreference::isEnabled).count();

            out.add(TelegramChatDto.builder()
                    .bindingId(b.getId())
                    .chatId(chatId)
                    .chatType(chatType)
                    .chatName(chatName)
                    .userId(b.getUserId())
                    .userName(u != null ? u.getFullName() : null)
                    .username(u != null ? u.getUsername() : null)
                    .linkedAt(b.getCreatedAt())
                    .enabledEventCount(enabled)
                    .totalEventCount(TOTAL_EVENTS)
                    .build());
        }
        return out;
    }

    private static String normalizeType(String telegramType) {
        if (telegramType == null) return "UNKNOWN";
        return switch (telegramType) {
            case "private" -> "DM";
            case "group", "supergroup", "channel" -> "GROUP";
            default -> "UNKNOWN";
        };
    }

    // ── CHT-2: per-chat event tercihleri ─────────────────────────────────────

    /**
     * Bir chat için TÜM event'lerin tercih durumu. Kayıt yoksa o event KAPALI
     * (opt-in). Liste her zaman tüm event'leri içerir (UI toggle'ları için).
     */
    @Transactional(readOnly = true)
    public List<TelegramChatEventPrefDto> listChatPreferences(UUID bindingId) {
        requireBinding(bindingId);
        Map<NotificationEvent, Boolean> stored = new HashMap<>();
        for (TelegramChatEventPreference p : prefRepository.findByBindingId(bindingId)) {
            stored.put(p.getEvent(), p.isEnabled());
        }
        List<TelegramChatEventPrefDto> out = new ArrayList<>(TOTAL_EVENTS);
        for (NotificationEvent ev : NotificationEvent.values()) {
            out.add(TelegramChatEventPrefDto.builder()
                    .event(ev)
                    .enabled(stored.getOrDefault(ev, false))
                    .build());
        }
        return out;
    }

    /** Bir chat için tek event tercihini upsert et (admin). */
    @Transactional
    public TelegramChatEventPrefDto setChatPreference(UUID bindingId, NotificationEvent event,
                                                      boolean enabled,
                                                      UUID adminUserId, String adminName) {
        NotificationChannelBinding binding = requireBinding(bindingId);
        TelegramChatEventPreference pref = prefRepository
                .findByBindingIdAndEvent(bindingId, event)
                .orElseGet(() -> TelegramChatEventPreference.builder()
                        .bindingId(bindingId).event(event).build());
        pref.setEnabled(enabled);
        prefRepository.save(pref);

        auditLogService.recordEntityAction(
                AuditAction.TELEGRAM_CHAT_PREF_CHANGED, adminUserId, adminName,
                "TELEGRAM_CHAT", bindingId,
                "Chat tercih: " + event + " = " + (enabled ? "açık" : "kapalı"),
                Map.of("chatId", String.valueOf(binding.getExternalId()),
                        "event", event.name(), "enabled", enabled));

        return TelegramChatEventPrefDto.builder().event(event).enabled(enabled).build();
    }

    /**
     * Fan-out kararı (CHT-2 saygısı): bu binding bu event'i almak istiyor mu?
     * Kayıt yoksa KAPALI (opt-in). Telegram channel fan-out'unda kullanılır.
     */
    @Transactional(readOnly = true)
    public boolean isEventEnabledForBinding(UUID bindingId, NotificationEvent event) {
        return prefRepository.findByBindingIdAndEvent(bindingId, event)
                .map(TelegramChatEventPreference::isEnabled)
                .orElse(false);
    }

    private NotificationChannelBinding requireBinding(UUID bindingId) {
        NotificationChannelBinding b = bindingRepository.findById(bindingId)
                .orElseThrow(() -> new EntityNotFoundException("Bağlı chat bulunamadı"));
        if (b.getChannel() != NotificationChannelType.TELEGRAM) {
            throw new EntityNotFoundException("Bağlı chat bulunamadı");
        }
        return b;
    }
}
