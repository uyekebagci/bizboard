package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/**
 * v1.6.19 (WP-2): POST /api/closings/today body.
 *
 * <p>{@code actual_balance} kullanıcının physical sayım sonucu. fark != 0 ise
 * {@code reason_category} ve {@code reason_note} backend tarafından önerilir
 * (zorunlu değil ama strongly recommended — UI tarafında validation).</p>
 */
@Data
public class CloseTodayRequest {

    @NotNull
    @JsonProperty("actual_balance")
    private BigDecimal actualBalance;

    /** LOSS / MIS_ENTRY / ROUNDING / OTHER. */
    @JsonProperty("reason_category")
    private String reasonCategory;

    @JsonProperty("reason_note")
    private String reasonNote;
}
