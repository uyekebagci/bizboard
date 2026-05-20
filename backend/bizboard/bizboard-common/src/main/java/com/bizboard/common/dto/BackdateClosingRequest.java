package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * v1.6.23.4 (BUG-2 fix): POST /closings body — geçmiş tarih için kapanış.
 *
 * <p>{@link CloseTodayRequest}'in aksine {@code closing_date} explicit verilir
 * — geçmiş bir tarih için kapanış oluşturmak/güncellemek için kullanılır.
 * Migration ve atlanmış günleri toparlamak için gerekli.</p>
 *
 * <p>Admin role gerektirir (controller enforce eder).</p>
 *
 * <p>Idempotency: aynı tarih için CLOSED kayıt varsa
 * {@code override=true} verilmedikçe 409 döner.</p>
 */
@Data
public class BackdateClosingRequest {

    @NotNull
    @JsonProperty("closing_date")
    private LocalDate closingDate;

    @NotNull
    @JsonProperty("actual_balance")
    private BigDecimal actualBalance;

    /** LOSS / MIS_ENTRY / ROUNDING / OTHER. */
    @JsonProperty("reason_category")
    private String reasonCategory;

    @JsonProperty("reason_note")
    private String reasonNote;

    /**
     * Mevcut CLOSED kaydı varsa üstüne yaz. Default false — UNIQUE constraint
     * koruması.
     */
    private Boolean override;
}
