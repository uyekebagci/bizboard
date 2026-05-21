package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * v1.6.23.9 (TODO ddda6029): Toplu POS settle.
 *
 * <p>POST /pos-devices/bulk-settle body: { transaction_ids: [...], bank_account_id, settled_at? }.
 * Tüm tx'ler aynı bank'a aynı zamanda işaretlenir. Tek bir tx fail olursa
 * transaction tüm tx'leri rollback eder (atomic).</p>
 */
@Data
public class PosBulkSettleRequest {

    @NotEmpty
    @JsonProperty("transaction_ids")
    private List<UUID> transactionIds;

    @NotNull
    @JsonProperty("bank_account_id")
    private UUID bankAccountId;

    @JsonProperty("settled_at")
    private LocalDateTime settledAt;
}
