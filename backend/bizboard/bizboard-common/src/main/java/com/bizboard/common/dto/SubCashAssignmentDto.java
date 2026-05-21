package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.23.27 (UI Fix WP TODO fbf92aa9 + 52459999): Sub-Cash assignment DTO.
 */
@Data
@Builder
public class SubCashAssignmentDto {

    private UUID id;

    @JsonProperty("sub_cash_id")
    private UUID subCashId;

    @JsonProperty("sub_cash_name")
    private String subCashName;

    @JsonProperty("business_id")
    private UUID businessId;

    /** COUNTERPART / POS_DEVICE / BANK_ACCOUNT */
    @JsonProperty("entity_type")
    private String entityType;

    @JsonProperty("entity_id")
    private UUID entityId;

    /** UI için entity'nin görünür adı (counterpart.name, pos.name, bank.name). */
    @JsonProperty("entity_name")
    private String entityName;

    /**
     * Entity'nin aggregate katkısı (BANK_ACCOUNT için current_balance,
     * diğerleri için 0). UI sub-cash detay sayfasında satır toplamı için.
     */
    @JsonProperty("entity_balance_contribution")
    private java.math.BigDecimal entityBalanceContribution;

    @JsonProperty("assigned_at")
    private LocalDateTime assignedAt;

    @JsonProperty("assigned_by")
    private UUID assignedBy;
}
