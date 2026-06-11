package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Ledger v2 (Faz B — Gün Açılışı): tek para-hesabın açılış bacağı DTO'su.
 * Preview'de {@code rounded}=carriedOver (kullanıcı henüz dokunmadı); finalize
 * sonrası kullanıcının yuvarladığı değer.
 */
@Data
@Builder
public class DayOpenAccountOpeningDto {

    private UUID id;

    @JsonProperty("account_id")
    private UUID accountId;

    @JsonProperty("account_name")
    private String accountName;

    @JsonProperty("account_type")
    private String accountType;

    /** Önceki CLOSED gün actual'ından otomatik devir. */
    @JsonProperty("carried_over")
    private BigDecimal carriedOver;

    /** Kullanıcının yuvarladığı açılış. */
    private BigDecimal rounded;

    /** rounded − carriedOver. */
    @JsonProperty("rounding_delta")
    private BigDecimal roundingDelta;
}
