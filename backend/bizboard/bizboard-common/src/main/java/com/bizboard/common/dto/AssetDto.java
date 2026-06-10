package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §3.1 / §7) — ayni varlık (ASSET hesabı) ekran DTO'su.
 *
 * <p>Bir ASSET, dedike bir {@code BankAccount(type=ASSET)} olarak tutulur; bakiye
 * = defter değeri (Σ posting). Satılınca hesap pasifleşir.</p>
 */
@Data
@Builder
public class AssetDto {

    @JsonProperty("account_id")
    private UUID accountId;

    private String name;

    /** Güncel defter değeri = Σ posting (satıştan sonra 0). */
    @JsonProperty("book_value")
    private BigDecimal bookValue;

    private boolean active;   // true = portföyde, false = satıldı/elden çıktı

    private String notes;
}
