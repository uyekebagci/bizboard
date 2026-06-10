package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §4.2): onaylı kapanış düzenleme isteği çıkış DTO'su.
 */
@Data
@Builder
public class DayCloseEditRequestDto {

    private UUID id;

    @JsonProperty("day_close_id")
    private UUID dayCloseId;

    @JsonProperty("close_date")
    private LocalDate closeDate;

    private String status;

    private Map<String, Object> payload;

    @JsonProperty("before_snapshot")
    private Map<String, Object> beforeSnapshot;

    @JsonProperty("reason_category")
    private String reasonCategory;

    @JsonProperty("reason_note")
    private String reasonNote;

    @JsonProperty("requested_by")
    private UUID requestedBy;

    @JsonProperty("requested_at")
    private LocalDateTime requestedAt;

    @JsonProperty("approved_by")
    private UUID approvedBy;

    @JsonProperty("approved_at")
    private LocalDateTime approvedAt;

    @JsonProperty("applied_at")
    private LocalDateTime appliedAt;

    @JsonProperty("reject_note")
    private String rejectNote;
}
