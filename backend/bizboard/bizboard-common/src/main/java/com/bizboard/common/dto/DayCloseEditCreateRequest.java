package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §4.2): finalize kapanış düzenleme ÖNERİ body'si.
 *
 * <p>Önerilen yeni sayımlar + ZORUNLU gerekçe. Doğrudan uygulanmaz —
 * PENDING request oluşur, admin onaylar.</p>
 */
@Data
public class DayCloseEditCreateRequest {

    @NotNull
    @JsonProperty("day_close_id")
    private UUID dayCloseId;

    /** Önerilen yeni hesap sayımları (boş = sayım değişmeyecek, sadece reason). */
    @Valid
    @JsonProperty("account_counts")
    private List<CloseDayRequest.AccountCountInput> accountCounts;

    @JsonProperty("variance_threshold")
    private BigDecimal varianceThreshold;

    /** ZORUNLU gerekçe kategorisi: LOSS/MIS_ENTRY/ROUNDING/OTHER. */
    @NotBlank
    @JsonProperty("reason_category")
    private String reasonCategory;

    @NotBlank
    @JsonProperty("reason_note")
    private String reasonNote;
}
