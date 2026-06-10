package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.5 / TODO 1+7) — POS işlem (deal) girişi isteği.
 *
 * <p>Operatör girer: brüt + müşteri oranı + cihaz (→ sahip otomatik) + opsiyonel
 * getiren + tarih. Kâr-payı şelalesi bu girdiden hesaplanır.</p>
 */
@Data
public class CreatePosDealRequest {

    @NotNull(message = "pos_device_id zorunlu")
    @JsonProperty("pos_device_id")
    private UUID posDeviceId;

    @NotNull(message = "gross_amount zorunlu")
    @DecimalMin(value = "0.01", message = "gross_amount > 0 olmalı")
    @JsonProperty("gross_amount")
    private BigDecimal grossAmount;

    @NotNull(message = "customer_rate zorunlu (operatörün seçtiği müşteri oranı)")
    @DecimalMin(value = "0.0", message = "customer_rate negatif olamaz")
    @JsonProperty("customer_rate")
    private BigDecimal customerRate;

    /** Opsiyonel getiren (işi getiren kişi/firma). */
    @JsonProperty("referrer_counterpart_id")
    private UUID referrerCounterpartId;

    /** Opsiyonel yatış havuzu hesabı (POS sahibi firma adına). */
    @JsonProperty("owner_account_id")
    private UUID ownerAccountId;

    /** Deal tarihi — null = bugün. Geçmiş tarih backdated (admin/flag ileride). */
    @JsonProperty("deal_date")
    private LocalDate dealDate;

    private String notes;
}
