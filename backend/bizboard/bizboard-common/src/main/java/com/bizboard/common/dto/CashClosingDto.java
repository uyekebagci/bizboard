package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.19 (WP-2): Günlük kasa kapanışı çıkış DTO'su.
 */
@Data
@Builder
public class CashClosingDto {

    private UUID id;

    @JsonProperty("closing_date")
    private LocalDate closingDate;

    @JsonProperty("opening_balance")
    private BigDecimal openingBalance;

    @JsonProperty("computed_closing")
    private BigDecimal computedClosing;

    @JsonProperty("actual_balance")
    private BigDecimal actualBalance;

    private BigDecimal difference;

    /** PENDING / CLOSED / REOPENED */
    private String status;

    @JsonProperty("is_auto")
    private boolean auto;

    @JsonProperty("closed_at")
    private LocalDateTime closedAt;

    @JsonProperty("closed_by")
    private UUID closedBy;

    @JsonProperty("reason_category")
    private String reasonCategory;

    @JsonProperty("reason_note")
    private String reasonNote;
}
