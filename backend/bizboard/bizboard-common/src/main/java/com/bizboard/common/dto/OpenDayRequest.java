package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B — Gün Açılışı): "Günü Aç" finalize body.
 *
 * <p>{@code openDate} null = bugün; geçmiş tarih = backdated (admin + feature
 * flag). {@code openings} her para-hesabın yuvarlanmış açılışı — verilmeyen
 * hesaplar için carriedOver (otomatik devir) kullanılır.</p>
 */
@Data
public class OpenDayRequest {

    /** Null = bugün. Geçmiş tarih → backdated akış (admin + feature flag). */
    @JsonProperty("open_date")
    private LocalDate openDate;

    /**
     * Her para-hesabın yuvarlanmış açılış bakiyesi. Boş/null verilirse tüm
     * hesaplar carriedOver (otomatik devir, delta=0) ile açılır.
     */
    @Valid
    @JsonProperty("account_openings")
    private List<AccountOpeningInput> accountOpenings;

    @JsonProperty("reason_note")
    private String reasonNote;

    /** Mevcut OPEN kaydın üstüne yaz (yeniden açılış / düzeltme). Default false. */
    private Boolean override;

    @Data
    public static class AccountOpeningInput {
        @NotNull
        @JsonProperty("account_id")
        private UUID accountId;

        /** Kullanıcının yuvarladığı açılış (zorunlu — verilen hesaplar için). */
        @NotNull
        @JsonProperty("rounded_opening")
        private BigDecimal roundedOpening;
    }
}
