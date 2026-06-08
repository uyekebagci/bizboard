package com.bizboard.common.dto;

import com.bizboard.common.enums.NotificationChannelType;
import com.bizboard.common.enums.NotificationEvent;
import jakarta.validation.constraints.NotNull;
import lombok.Builder;
import lombok.Data;

/**
 * WP f1fa3cd5: Kullanıcı bildirim tercihi payload'u (GET listesi + PUT upsert).
 * Kullanıcı yalnız kendi tercihlerini görür/değiştirir (userId controller'da
 * principal'dan alınır, body'de TAŞINMAZ).
 */
@Data
@Builder
public class NotificationPreferenceDto {

    @NotNull
    private NotificationEvent event;

    @NotNull
    private NotificationChannelType channel;

    private boolean enabled;
}
