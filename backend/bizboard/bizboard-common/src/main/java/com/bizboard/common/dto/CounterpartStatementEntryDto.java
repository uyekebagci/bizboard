package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Cari hesap ekstresinin tek satırı (bir borç hareketi).
 *
 * <p>Statement endpoint'i bunları kronolojik sırada döner; her satır
 * sonrası bakiye {@link #runningBalance} ile gösterilir.</p>
 */
@Data
@Builder
public class CounterpartStatementEntryDto {

    @JsonProperty("debt_id")
    private UUID debtId;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    /** RECEIVABLE → alacak (firma bize borçlu); PAYABLE → verecek (biz firmaya borçluyuz). */
    private String direction;

    private BigDecimal amount;

    private String currency;

    @JsonProperty("instrument_type")
    private String instrumentType;

    @JsonProperty("due_date")
    private LocalDate dueDate;

    private boolean settled;

    @JsonProperty("settled_at")
    private LocalDateTime settledAt;

    private String description;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    /** Bu satırdan sonraki kümülatif bakiye (yalnız aktif/settled olmayanlar dahil). */
    @JsonProperty("running_balance")
    private BigDecimal runningBalance;
}
