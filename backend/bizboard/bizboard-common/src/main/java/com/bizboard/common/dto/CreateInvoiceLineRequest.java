package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/** e-Fatura satır kalemi giriş isteği. */
@Data
public class CreateInvoiceLineRequest {

    @NotBlank(message = "Kalem adı zorunlu")
    @JsonProperty("item_name")
    private String itemName;

    private String description;

    /** UBL birim kodu; boş bırakılırsa "C62" (adet) varsayılır. */
    @JsonProperty("unit_code")
    private String unitCode;

    @NotNull(message = "Miktar zorunlu")
    @DecimalMin(value = "0.0001", message = "Miktar 0'dan büyük olmalı")
    private BigDecimal quantity;

    @NotNull(message = "Birim fiyat zorunlu")
    @DecimalMin(value = "0.0", message = "Birim fiyat negatif olamaz")
    @JsonProperty("unit_price")
    private BigDecimal unitPrice;

    /** KDV oranı (%). Boş bırakılırsa %20 varsayılır. */
    @JsonProperty("vat_rate")
    private BigDecimal vatRate;

    @JsonProperty("discount_amount")
    private BigDecimal discountAmount;
}
