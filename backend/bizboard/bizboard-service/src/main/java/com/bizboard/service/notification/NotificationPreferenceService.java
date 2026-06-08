package com.bizboard.service.notification;

import com.bizboard.common.entity.NotificationPreference;
import com.bizboard.common.enums.NotificationChannelType;
import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.repository.NotificationPreferenceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * WP f1fa3cd5: Kullanıcı bildirim tercihleri.
 *
 * <p>Dispatch katmanı "{user} {event} olayını {channel} kanalından almak istiyor mu?"
 * sorusunu {@link #isEnabled} ile sorar. Kayıt yoksa makul VARSAYILAN uygulanır:</p>
 * <ul>
 *   <li>IN_APP → varsayılan AÇIK (tüm olaylar).</li>
 *   <li>Harici kanallar (TELEGRAM/EMAIL/WHATSAPP) → varsayılan KAPALI
 *       (kullanıcı açıkça opt-in etmeden harici mesaj gitmez).</li>
 * </ul>
 *
 * <p>Erişim: kullanıcı yalnız kendi tercihlerini okur/yazar (servis çağıranı
 * actorUserId ile sınırlar; controller principal.getId() geçer).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationPreferenceService {

    private final NotificationPreferenceRepository repository;

    /** Dispatch kararı: bu kullanıcı bu olayı bu kanaldan almak istiyor mu? */
    @Transactional(readOnly = true)
    public boolean isEnabled(UUID userId, NotificationEvent event, NotificationChannelType channel) {
        return repository.findByUserIdAndEventAndChannel(userId, event, channel)
                .map(NotificationPreference::isEnabled)
                .orElseGet(() -> defaultEnabled(channel));
    }

    /** Kayıt yoksa varsayılan: IN_APP açık, harici kanallar kapalı (opt-in). */
    private boolean defaultEnabled(NotificationChannelType channel) {
        return channel == NotificationChannelType.IN_APP;
    }

    /** Kullanıcının tüm tercihleri (API listesi). */
    @Transactional(readOnly = true)
    public List<NotificationPreference> listForUser(UUID userId) {
        return repository.findByUserId(userId);
    }

    /**
     * Tercihi upsert et (kullanıcı yalnız kendi tercihini). Var olan (user,event,channel)
     * satırı varsa enabled güncellenir; yoksa yeni satır.
     */
    @Transactional
    public NotificationPreference setPreference(UUID userId,
                                                NotificationEvent event,
                                                NotificationChannelType channel,
                                                boolean enabled) {
        NotificationPreference pref = repository
                .findByUserIdAndEventAndChannel(userId, event, channel)
                .orElseGet(() -> NotificationPreference.builder()
                        .userId(userId).event(event).channel(channel).build());
        pref.setEnabled(enabled);
        NotificationPreference saved = repository.save(pref);
        log.debug("[notif-pref] user={} event={} channel={} enabled={}",
                userId, event, channel, enabled);
        return saved;
    }
}
