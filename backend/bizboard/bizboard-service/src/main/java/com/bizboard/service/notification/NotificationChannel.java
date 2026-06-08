package com.bizboard.service.notification;

import com.bizboard.common.dto.NotificationMessage;
import com.bizboard.common.enums.NotificationChannelType;

/**
 * WP f1fa3cd5: Bildirim teslim kanalı — pluggable arayüz.
 *
 * <p>Dispatch katmanı kanal-agnostiktir: çözümlenmiş bir {@link NotificationMessage}'i
 * uygun (etkin + tercih edilen) kanallara {@link #send} ile teslim eder. Yeni kanal
 * eklemek için bu arayüzü implemente eden bir Spring bean yazmak yeterlidir; dispatch
 * koduna dokunmaya gerek yoktur (tüm channel bean'leri otomatik toplanır).</p>
 *
 * <p>Mevcut implementasyon: {@link InAppNotificationChannel} (IN_APP).</p>
 * <p>TODO: Telegram channel (WP f1fa3cd5) — {@code TelegramNotificationChannel
 * implements NotificationChannel} eklenecek; {@link #type()} = TELEGRAM döner,
 * {@link #send} chat_id'yi NotificationChannelBinding'den çözüp bota POST eder.</p>
 */
public interface NotificationChannel {

    /** Bu kanalın tipi (dispatch + preference eşlemesi için). */
    NotificationChannelType type();

    /**
     * Kanal şu an teslim yapabilir mi? (örn. harici kanalda token/config eksikse
     * false). IN_APP daima true. Dispatch, false dönen kanalı sessizce atlar.
     */
    boolean isEnabled();

    /**
     * Mesajı bu kanal üzerinden teslim et. Implementasyon idempotent/best-effort
     * olmalı; fırlatılan exception dispatch tarafından yakalanıp loglanır, diğer
     * kanalları/alıcıları engellemez.
     */
    void send(NotificationMessage message);
}
