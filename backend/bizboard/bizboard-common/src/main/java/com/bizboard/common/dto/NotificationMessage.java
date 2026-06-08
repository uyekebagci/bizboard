package com.bizboard.common.dto;

import com.bizboard.common.enums.NotificationEvent;
import com.bizboard.common.enums.NotificationType;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

/**
 * WP f1fa3cd5: Kanal-agnostik, çözümlenmiş bildirim mesajı.
 *
 * <p>Dispatch katmanı olay + şablon + değişkenlerden bunu üretir; her
 * {@code NotificationChannel} bunu kendi formatına çevirip teslim eder
 * (in-app: notifications tablosu; Telegram: chat mesajı; vb.).</p>
 *
 * <p>Kanal-spesifik alan YOKTUR — taşıma detayları (chat_id, e-posta adresi)
 * channel implementasyonunda binding'den çözülür, burada değil.</p>
 */
@Data
@Builder
public class NotificationMessage {

    /** Alıcı kullanıcı (zorunlu — tüm kanallar kullanıcı bazlı çözümlenir). */
    private UUID recipientUserId;

    /** Üreten domain olayı (audit/trigger + kanal-spesifik şablon seçimi için). */
    private NotificationEvent event;

    /** Seviye (in-app rozet rengi / önceliklendirme). */
    private NotificationType type;

    /** Çözümlenmiş başlık (şablondan render edilmiş). */
    private String title;

    /** Çözümlenmiş gövde (şablondan render edilmiş). */
    private String body;

    /** Tıklanınca gidilecek frontend rotası (opsiyonel). */
    private String actionUrl;

    /** İlişkili işletme (opsiyonel — multi-tenant bağlam). */
    private UUID businessId;
}
