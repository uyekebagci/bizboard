package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §3.1 / §7) — ayni varlık edinim isteği.
 *
 * <p>İş karşılığı alınan araba/mal → ASSET hesabına (envanter) defter değeriyle
 * giriş. Karşı taraf (malı veren) opsiyonel cari.</p>
 */
@Data
public class AcquireAssetRequest {

    @NotBlank(message = "name (varlık adı) zorunlu")
    private String name;

    /** Defter değeri (edinim değeri). */
    @NotNull(message = "book_value zorunlu")
    @DecimalMin(value = "0.01", message = "book_value > 0 olmalı")
    @JsonProperty("book_value")
    private BigDecimal bookValue;

    /** Malı veren karşı taraf (opsiyonel). */
    @JsonProperty("counterpart_id")
    private UUID counterpartId;

    /** Edinim tarihi — null = bugün. */
    @JsonProperty("acquired_date")
    private LocalDate acquiredDate;

    private String notes;
}
