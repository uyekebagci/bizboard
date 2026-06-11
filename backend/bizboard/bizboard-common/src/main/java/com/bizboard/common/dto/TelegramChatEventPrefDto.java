package com.bizboard.common.dto;

import com.bizboard.common.enums.NotificationEvent;
import jakarta.validation.constraints.NotNull;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

/**
 * CHT-2: bir chat için tek event tercihi (GET listede satır / PUT body).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelegramChatEventPrefDto {

    @NotNull
    private NotificationEvent event;

    private boolean enabled;
}
