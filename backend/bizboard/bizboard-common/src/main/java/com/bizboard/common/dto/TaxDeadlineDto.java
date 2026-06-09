package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;

/**
 * Vergi Takvimi Modülü — bir tekrarlayan kuraldan üretilmiş <b>somut</b> son tarih.
 *
 * <p>{@code GET /tax-calendar?from=&to=} bir aralıktaki tüm occurrence'ları
 * tarih sırasıyla döner. Frontend takvim/kart görünümü bunu kullanır.</p>
 */
@Data
@Builder
public class TaxDeadlineDto {

    /** Vergi türü enum sabiti (ör. "KDV"). */
    @JsonProperty("obligation_type")
    private String obligationType;

    /** Kullanıcıya gösterilecek TR başlık (ör. "KDV Beyannamesi"). */
    private String label;

    /** TR açıklama (ör. "Mart 2026 dönemi KDV beyan ve ödeme son günü"). */
    private String description;

    /** Somut son tarih (yıl dahil). */
    @JsonProperty("due_date")
    private LocalDate dueDate;

    /** Bu son tarihin kapsadığı vergi dönemi etiketi (ör. "2026-03", "2026-Q1", "2025"). */
    private String period;

    /** Bugünden son tarihe kalan gün sayısı (negatif → geçmiş). */
    @JsonProperty("days_until")
    private long daysUntil;
}
