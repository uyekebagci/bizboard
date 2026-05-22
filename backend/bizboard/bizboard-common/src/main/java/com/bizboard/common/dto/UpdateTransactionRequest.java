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

    /** v1.6.3 / v1.7.x: BANKA komisyon oranı (opsiyonel update). */
    @JsonProperty("pos_rate")
    private BigDecimal posRate;

    /**
     * v1.7.x (POS Komisyon WP TODO 6ffe0665): Bizim komisyon oranımız update.
     * Verilirse our_commission_rate &gt;= pos_rate validation çalışır.
     */
    @JsonProperty("our_commission_rate")
    private BigDecimal ourCommissionRate;

    /**
     * v1.6.21 (WP-4): POS çekiminin banka hesabına düşüp düşmediği.
     * null = anlamsız (nakit/non-POS), false = bekliyor, true = hesaba düştü.
     */
    @JsonProperty("pos_settled")
    private Boolean posSettled;

    /**
     * v1.6.23.4 (BUG-1 fix): paymentMethod=HESAPDAN için bank_account FK.
     * Mevcut tx HESAPDAN ise bu alan opsiyonel (mevcut bank kullanılır);
     * tx HESAPDAN'a çevriliyorsa zorunlu. Servis eski tx'in bank_account
     * üzerindeki etkisini reverse edip yeni state'i uygular.
     */
    @JsonProperty("bank_account_id")
    private UUID bankAccountId;
}
