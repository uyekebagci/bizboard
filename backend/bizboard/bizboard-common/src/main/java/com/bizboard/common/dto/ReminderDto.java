package com.bizboard.common.dto;

import com.bizboard.common.enums.ReminderRecurrence;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Client'a dönülen standalone hatırlatıcı payload'u (snake_case sözleşmesi —
 * codebase'in baskın deseni).
 */
@Data
@Builder
public class ReminderDto {

    private UUID id;

    private String title;

    private String message;

    @JsonProperty("remind_at")
    private LocalDateTime remindAt;

    private ReminderRecurrence recurrence;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    private boolean enabled;

    @JsonProperty("last_fired_at")
    private LocalDateTime lastFiredAt;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
}
