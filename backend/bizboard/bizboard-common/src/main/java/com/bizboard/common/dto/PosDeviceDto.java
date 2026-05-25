package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.20 (WP-3): POS cihazı DTO'su.
 */
@Data
@Builder
public class PosDeviceDto {

    private UUID id;

    /** v1.6.23.20 (Security WP / arch-rules §1.1): tenant binding. */
    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    private String name;

    @JsonProperty("owner_counterpart_id")
    private UUID ownerCounterpartId;

    @JsonProperty("owner_counterpart_name")
    private String ownerCounterpartName;

    /** v1.7.x: POS cihazını hangi kendi firmamıza ait (MyCompany). */
    @JsonProperty("owner_my_company_id")
    private UUID ownerMyCompanyId;

    @JsonProperty("owner_my_company_name")
    private String ownerMyCompanyName;

    @JsonProperty("bank_name")
    private String bankName;

    @JsonProperty("default_rate")
    private BigDecimal defaultRate;

    @JsonProperty("last_used_rate")
    private BigDecimal lastUsedRate;

    /**
     * v1.7.x (POS Komisyon WP TODO 1bb4529a): cihazın "bizim oran" defaultu.
     * Yeni POS tx girilirken pre-fill (default_rate=banka, our_commission_rate=bizim).
     */
    @JsonProperty("our_commission_rate")
    private BigDecimal ourCommissionRate;

    @JsonProperty("is_active")
    private boolean active;

    private String notes;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
