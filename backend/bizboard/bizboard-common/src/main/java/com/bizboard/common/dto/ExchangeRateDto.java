package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * WP a9da4e9d: Ekranda gösterilecek güncel kur. 1 birim {@code code} = rateToTry TL.
 */
@Data
@Builder
public class ExchangeRateDto {

    /** "USD" veya "GOLD" (gram altın). */
    private String code;

    @JsonProperty("rate_to_try")
    private BigDecimal rateToTry;

    private String source;

    @JsonProperty("fetched_at")
    private LocalDateTime fetchedAt;

    /** Dış API down → son (bayat) değer servis ediliyor. */
    private boolean stale;
}
