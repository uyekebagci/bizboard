package com.bizboard.service.notification;

import com.bizboard.common.dto.NotificationMessage;
import com.bizboard.common.enums.NotificationEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * WP f1fa3cd5: Kanal-agnostik bildirim DISPATCH katmanı — modülün giriş noktası.
 *
 * <p>Akış: domain olayı + alıcılar + değişkenler →
 * {@link NotificationTemplateRegistry} ile mesaj render → her alıcı × her kayıtlı
 * {@link NotificationChannel} için {@link NotificationPreferenceService} izni +
 * {@code channel.isEnabled()} kontrolü → izinli kanallara teslim.</p>
 *
 * <p>Kanallar Spring tarafından otomatik toplanır ({@code List<NotificationChannel>}):
 * şu an sadece {@link InAppNotificationChannel}. Telegram channel eklendiğinde bu
 * sınıf DEĞİŞMEZ — yeni bean otomatik dahil olur.</p>
 *
 * <p>Best-effort: tek bir kanal/alıcı hatası diğerlerini engellemez (yakalanır, loglanır).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationDispatchService {

    private final List<NotificationChannel> channels; // Spring tüm impl'leri enjekte eder
    private final NotificationTemplateRegistry templateRegistry;
    private final NotificationPreferenceService preferenceService;

    /**
     * Bir olayı birden çok alıcıya dağıt.
     *
     * @param event      domain olayı (şablon + varsayılan seviye seçimi)
     * @param recipients alıcı kullanıcı id'leri
     * @param vars       şablon değişkenleri (ör. counterparty, amount, when)
     * @param actionUrl  tıklanınca gidilecek frontend rotası (opsiyonel)
     * @param businessId ilişkili işletme (opsiyonel)
     */
    public void dispatch(NotificationEvent event,
                         List<UUID> recipients,
                         Map<String, String> vars,
                         String actionUrl,
                         UUID businessId) {
        if (recipients == null || recipients.isEmpty()) return;

        NotificationTemplateRegistry.Rendered r = templateRegistry.render(event, vars);

        for (UUID userId : recipients) {
            if (userId == null) continue;
            NotificationMessage msg = NotificationMessage.builder()
                    .recipientUserId(userId)
                    .event(event)
                    .type(r.type())
                    .title(r.title())
                    .body(r.body())
                    .actionUrl(actionUrl)
                    .businessId(businessId)
                    .build();
            deliverToChannels(msg);
        }
    }

    /** Tek alıcıya kısa yol. */
    public void dispatchToUser(NotificationEvent event, UUID userId,
                               Map<String, String> vars, String actionUrl, UUID businessId) {
        dispatch(event, List.of(userId), vars, actionUrl, businessId);
    }

    private void deliverToChannels(NotificationMessage msg) {
        for (NotificationChannel channel : channels) {
            try {
                if (!channel.isEnabled()) continue;
                if (!preferenceService.isEnabled(msg.getRecipientUserId(), msg.getEvent(), channel.type())) {
                    continue;
                }
                channel.send(msg);
            } catch (Exception e) {
                // Best-effort: bir kanal patlarsa diğerlerini ve diğer alıcıları engelleme.
                log.warn("[notif-dispatch] kanal={} alıcı={} olay={} teslim hatası: {}",
                        channel.type(), msg.getRecipientUserId(), msg.getEvent(), e.getMessage());
            }
        }
    }
}
