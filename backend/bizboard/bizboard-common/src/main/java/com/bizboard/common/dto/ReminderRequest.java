package com.bizboard.common.dto;

import com.bizboard.common.enums.ReminderRecurrence;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Standalone hatırlatıcı create/update payload'u (snake_case).
 *
 * <p>{@code remind_at} ZORUNLU; {@code recurrence} null → NONE (tek-sefer).
 * {@code business_id} opsiyonel; verilirse kullanıcının erişebildiği bir işletme
 * olmalı (servis doğrular).</p>
 */
@Data
public class ReminderRequest {

    @NotBlank(message = "title zorunlu")
    @Size(max = 200, message = "title en fazla 200 karakter")
    private String title;

    @Size(max = 4000, message = "message en fazla 4000 karakter")
    private String message;

    @NotNull(message = "remind_at zorunlu")
    @JsonProperty("remind_at")
    private LocalDateTime remindAt;

    /** null → NONE (tek-sefer). */
    private ReminderRecurrence recurrence;

    @JsonProperty("business_id")
    private UUID businessId;

    /** null → true (yeni hatırlatıcı varsayılan aktif). */
    private Boolean enabled;
}
