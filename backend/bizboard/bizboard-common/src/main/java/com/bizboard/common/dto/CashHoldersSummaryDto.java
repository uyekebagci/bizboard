package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * WP 2786a36e (Beta v1.1): "Elde Tutulan Nakitler" dashboard widget'ı için
 * business-scoped CASH_HOLDER bank_account özeti.
 */
@Data
@Builder
public class CashHoldersSummaryDto {

    private List<Item> items;

    @JsonProperty("total_amount")
    private BigDecimal totalAmount;

    @JsonProperty("total_count")
    private int totalCount;

    @Data
    @Builder
    public static class Item {
        @JsonProperty("bank_account_id")
        private UUID bankAccountId;

        @JsonProperty("holder_name")
        private String holderName;

        /** Hesap adı — UI'da auto-suggest "<holder> (Eldeki)" pattern'i. */
        private String name;

        @JsonProperty("current_balance")
        private BigDecimal currentBalance;

        @JsonProperty("last_tx_at")
        private LocalDateTime lastTxAt;
    }
}
