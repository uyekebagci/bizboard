package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * v1.6.21 (WP-4): PATCH /pos-devices/{id} body. Tüm alanlar opsiyonel —
 * yalnız null olmayanlar uygulanır (partial update).
 */
@Data
public class UpdatePosDeviceRequest {

    @Size(max = 120)
    private String name;

    /** @deprecated v1.7.x — owner_my_company_id tercih edilmeli. */
    @JsonProperty("owner_counterpart_id")
    private UUID ownerCounterpartId;

    /** v1.7.x: POS cihazı hangi kendi firmamıza (MyCompany) ait — partial update. */
    @JsonProperty("owner_my_company_id")
    private UUID ownerMyCompanyId;

    @JsonProperty("bank_name")
    @Size(max = 120)
    private String bankName;

    @JsonProperty("default_rate")
    private BigDecimal defaultRate;

    /** v1.7.x (POS Komisyon WP TODO 1bb4529a): Bizim oran default — partial update. */
    @JsonProperty("our_commission_rate")
    private BigDecimal ourCommissionRate;

    @JsonProperty("is_active")
    private Boolean active;

    private String notes;
}
