package com.bizboard.service.notification;

import com.bizboard.common.dto.NotificationMessage;
import com.bizboard.common.enums.NotificationChannelType;
import com.bizboard.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * WP f1fa3cd5: IN-APP teslim kanalı.
 *
 * <p>Mevcut {@link NotificationService#create} üzerine yazar — notifications
 * tablosuna kayıt ekler, mevcut GET /notifications + read endpoint'leri aynen
 * çalışmaya devam eder. Bu kanal mevcut altyapıyı BOZMADAN ona köprü kurar.</p>
 */
@Component
@RequiredArgsConstructor
public class InAppNotificationChannel implements NotificationChannel {

    private final NotificationService notificationService;

    @Override
    public NotificationChannelType type() {
        return NotificationChannelType.IN_APP;
    }

    @Override
    public boolean isEnabled() {
        return true; // in-app her zaman teslim edebilir.
    }

    @Override
    public void send(NotificationMessage m) {
        notificationService.create(
                m.getRecipientUserId(),
                m.getType(),
                m.getTitle(),
                m.getBody(),
                m.getActionUrl(),
                m.getBusinessId(),
                "event:" + (m.getEvent() != null ? m.getEvent().name() : "GENERIC"));
    }
}
