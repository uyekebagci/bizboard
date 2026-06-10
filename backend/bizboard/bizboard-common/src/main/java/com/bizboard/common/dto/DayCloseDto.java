package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.6): gün-kapanışı çıkış DTO'su. SAĞLAMA HESAP bloğunu
 * birebir taşır (Excel: ÖNCEKİ KASA / TOPLAM GELEN / TOPLAM GİDEN / OLMASI
 * GEREKEN / SON KASA / ARTI EKSİ KALAN).
 */
@Data
@Builder
public class DayCloseDto {

    private UUID id;

    @JsonProperty("close_date")
    private LocalDate closeDate;

    private String status;

    /** ÖNCEKİ KASA. */
    @JsonProperty("opening_balance")
    private BigDecimal openingBalance;

    /** TOPLAM GELEN. */
    @JsonProperty("total_in")
    private BigDecimal totalIn;

    /** TOPLAM GİDEN. */
    @JsonProperty("total_out")
    private BigDecimal totalOut;

    /** OLMASI GEREKEN KASA (computed). */
    @JsonProperty("computed_closing")
    private BigDecimal computedClosing;

    /** SON KASA (Σ sayım). */
    @JsonProperty("actual_total")
    private BigDecimal actualTotal;

    /** ARTI EKSİ KALAN = computed − actual (eksi=fazla, artı=eksik/kayıp). */
    private BigDecimal variance;

    @JsonProperty("variance_threshold")
    private BigDecimal varianceThreshold;

    @JsonProperty("alarm_fired")
    private boolean alarmFired;

    @JsonProperty("is_backdated")
    private boolean backdated;

    @JsonProperty("created_via")
    private String createdVia;

    @JsonProperty("reason_category")
    private String reasonCategory;

    @JsonProperty("reason_note")
    private String reasonNote;

    @JsonProperty("closed_by")
    private UUID closedBy;

    @JsonProperty("closed_at")
    private LocalDateTime closedAt;

    @JsonProperty("account_counts")
    private List<DayCloseAccountCountDto> accountCounts;
}
