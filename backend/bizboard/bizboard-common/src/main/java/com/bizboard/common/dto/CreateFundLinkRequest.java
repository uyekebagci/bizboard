package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * "Para İzi" — fon-bağı (FundLink) oluşturma isteği.
 *
 * <p>Hedef işlem (path'teki {@code txId}) bir KAYNAK işleme bağlanır. Kaynak
 * genelde GİRİŞ/tahsilat, hedef genelde ÇIKIŞ/giderdir. {@code amount} kısmi
 * olabilir (kaynağın kalanına kadar). Bakiye/P&L'i ETKİLEMEZ — saf metadata.</p>
 */
@Data
public class CreateFundLinkRequest {

    /** Paranın geldiği KAYNAK işlem (genelde giriş/tahsilat). */
    @NotNull(message = "source_transaction_id (kaynak işlem) zorunlu")
    @JsonProperty("source_transaction_id")
    private UUID sourceTransactionId;

    /**
     * Bu bağda tahsis edilen tutar (kaynağın KALANINA kadar). &gt; 0.
     * Kalan'dan büyükse over-allocation → 400.
     */
    @NotNull(message = "amount (tahsis tutarı) zorunlu")
    @Positive(message = "amount > 0 olmalı")
    private BigDecimal amount;

    /** Opsiyonel not (ör. "kira için"). */
    @Size(max = 500, message = "not en fazla 500 karakter")
    private String note;
}
