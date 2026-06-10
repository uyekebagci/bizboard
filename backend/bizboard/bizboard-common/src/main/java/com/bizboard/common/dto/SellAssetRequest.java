package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Ledger v2 (Faz D, §7) — ayni varlık satış isteği.
 *
 * <p>ASSET çıkışı (defter değeri) + para hesabına giriş (satış bedeli) + kâr/zarar
 * P&L. Σ=0 dengeli posting.</p>
 */
@Data
public class SellAssetRequest {

    /** Satılan ASSET hesabının id'si. */
    @NotNull(message = "asset_account_id zorunlu")
    @JsonProperty("asset_account_id")
    private UUID assetAccountId;

    /** Satış bedelinin yatacağı para hesabı. */
    @NotNull(message = "money_account_id zorunlu")
    @JsonProperty("money_account_id")
    private UUID moneyAccountId;

    /** Satış bedeli. */
    @NotNull(message = "sale_price zorunlu")
    @DecimalMin(value = "0.0", message = "sale_price negatif olamaz")
    @JsonProperty("sale_price")
    private BigDecimal salePrice;

    /** Satış tarihi — null = bugün. */
    @JsonProperty("sold_date")
    private LocalDate soldDate;

    private String notes;
}
