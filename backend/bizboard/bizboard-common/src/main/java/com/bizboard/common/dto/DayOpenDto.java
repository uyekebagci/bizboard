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
 * Ledger v2 (Faz B — Gün Açılışı): gün-açılışı çıkış DTO'su. Hem finalize sonucu
 * hem canlı önizleme (preview) için kullanılır (DayCloseDto deseni gibi).
 *
 * <p>{@code lifecycleStatus}: AÇILMAMIŞ/AÇIK/KAPALI birleşik durum (UI rozeti).</p>
 */
@Data
@Builder
public class DayOpenDto {

    private UUID id;

    @JsonProperty("open_date")
    private LocalDate openDate;

    /** OPEN / CLOSED (DayOpen kaydı durumu); preview'de kayıt yoksa null. */
    private String status;

    /** AÇILMAMIŞ/AÇIK/KAPALI birleşik gün yaşam-döngüsü. */
    @JsonProperty("lifecycle_status")
    private String lifecycleStatus;

    /** Σ carriedOver (yuvarlamadan önce devir). */
    @JsonProperty("carried_over_total")
    private BigDecimal carriedOverTotal;

    /** Σ rounded (gün açılışı opening'i). */
    @JsonProperty("rounded_total")
    private BigDecimal roundedTotal;

    /** roundedTotal − carriedOverTotal (devir-yuvarlama farkı). */
    @JsonProperty("rounding_delta")
    private BigDecimal roundingDelta;

    @JsonProperty("rounding_entry_id")
    private UUID roundingEntryId;

    @JsonProperty("reason_note")
    private String reasonNote;

    @JsonProperty("is_backdated")
    private boolean backdated;

    @JsonProperty("created_via")
    private String createdVia;

    @JsonProperty("opened_by")
    private UUID openedBy;

    @JsonProperty("opened_at")
    private LocalDateTime openedAt;

    @JsonProperty("account_openings")
    private List<DayOpenAccountOpeningDto> accountOpenings;
}
