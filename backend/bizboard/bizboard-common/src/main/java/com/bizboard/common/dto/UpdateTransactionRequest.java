package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
public class UpdateTransactionRequest {

    private String direction;

    private BigDecimal amount;

    private String currency;

    private String description;

    private LocalDate date;

    @JsonProperty("category_id")
    private UUID categoryId;

    private List<String> tags;

    private Map<String, Object> metadata;

    /** v1.6.3: ödeme yöntemi — "POS" veya "NAKIT" (opsiyonel update). */
    @JsonProperty("payment_method")
    private String paymentMethod;

    /** v1.6.3: POS komisyon oranı (opsiyonel update). */
    @JsonProperty("pos_rate")
    private BigDecimal posRate;

    /**
     * v1.6.21 (WP-4): POS çekiminin banka hesabına düşüp düşmediği.
     * null = anlamsız (nakit/non-POS), false = bekliyor, true = hesaba düştü.
     */
    @JsonProperty("pos_settled")
    private Boolean posSettled;
}
