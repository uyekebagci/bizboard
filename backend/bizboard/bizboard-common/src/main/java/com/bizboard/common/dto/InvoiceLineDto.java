package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
@Builder
public class InvoiceLineDto {

    private UUID id;

    @JsonProperty("line_number")
    private Integer lineNumber;

    @JsonProperty("item_name")
    private String itemName;

    private String description;

    @JsonProperty("unit_code")
    private String unitCode;

    private BigDecimal quantity;

    @JsonProperty("unit_price")
    private BigDecimal unitPrice;

    @JsonProperty("vat_rate")
    private BigDecimal vatRate;

    @JsonProperty("discount_amount")
    private BigDecimal discountAmount;

    @JsonProperty("line_extension_amount")
    private BigDecimal lineExtensionAmount;

    @JsonProperty("vat_amount")
    private BigDecimal vatAmount;
}
