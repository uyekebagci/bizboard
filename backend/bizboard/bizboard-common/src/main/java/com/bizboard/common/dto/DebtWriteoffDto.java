package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * WP a9da4e9d: Borç silme kaydı DTO'su.
 */
@Data
@Builder
public class DebtWriteoffDto {

    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("counterpart_id")
    private UUID counterpartId;

    @JsonProperty("counterpart_name")
    private String counterpartName;

    @JsonProperty("debt_id")
    private UUID debtId;

    private BigDecimal amount;

    private String reason;

    @JsonProperty("written_off_by")
    private UUID writtenOffBy;

    @JsonProperty("written_off_by_name")
    private String writtenOffByName;

    @JsonProperty("written_off_at")
    private LocalDateTime writtenOffAt;

    // Response convenience — POST sonrası kullanıcıya gösterilir
    @JsonProperty("debt_remaining_after")
    private BigDecimal debtRemainingAfter;

    @JsonProperty("debt_status_after")
    private String debtStatusAfter;
}
