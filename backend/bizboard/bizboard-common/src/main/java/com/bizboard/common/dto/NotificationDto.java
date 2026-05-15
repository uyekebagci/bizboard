package com.bizboard.common.dto;

import com.bizboard.common.enums.NotificationType;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Client'a dönülen bildirim payload'u.
 *
 * <p>Frontend type ({@code src/types/index.ts → Notification}) bu modelin
 * snake_case eşdeğeridir; {@code @JsonProperty} ile uyumluluk sağlıyoruz.
 * Diğer DTO'lar (AuthResponse) camelCase; bildirim tarafı tarihi snake_case
 * sözleşmesini koruyor — başka yere yayılmadan refactor için v2.0.0'a
 * not eklendi.</p>
 */
@Data
@Builder
public class NotificationDto {

    private UUID id;

    private NotificationType type;

    private String title;

    private String message;

    @JsonProperty("is_read")
    private boolean read;

    @JsonProperty("action_url")
    private String actionUrl;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
