package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.20 (WP-3): Banka hesabı / kasa DTO'su.
 */
@Data
@Builder
public class BankAccountDto {

    private UUID id;

    /**
     * v1.6.23.19 (Security WP 667d8a71 / TODO 7432143f): hesabın bağlı olduğu
     * işletmenin id'si — UI multi-tenant filter / etiketleme için kullanır.
     */
    @JsonProperty("business_id")
    private UUID businessId;

    /** İşletme görünür adı (UI rozet/etiket). */
    @JsonProperty("business_name")
    private String businessName;

    private String name;
    private String type; // CHECKING / SAVINGS / CASH / CASH_HOLDER

    @JsonProperty("bank_name")
    private String bankName;

    private String iban;
    private String currency;

    @JsonProperty("holder_person_id")
    private UUID holderPersonId;

    @JsonProperty("holder_person_name")
    private String holderPersonName;

    @JsonProperty("current_balance")
    private BigDecimal currentBalance;

    @JsonProperty("is_active")
    private boolean active;

    private String notes;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
