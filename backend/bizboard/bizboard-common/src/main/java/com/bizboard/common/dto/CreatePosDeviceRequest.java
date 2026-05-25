package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * v1.6.21 (WP-4): POST /pos-devices body.
 */
@Data
public class CreatePosDeviceRequest {

    /**
     * v1.6.23.20 (Security WP / arch-rules §1.1): tenant binding.
     * Null gönderilirse servis, kullanıcının tek erişebildiği işletmeyi otomatik seçer.
     */
    @JsonProperty("business_id")
    private UUID businessId;

    @NotBlank
    @Size(max = 120)
    private String name;

    /** @deprecated v1.7.x — owner_my_company_id tercih edilmeli. */
    @JsonProperty("owner_counterpart_id")
    private UUID ownerCounterpartId;

    /** v1.7.x: POS cihazı hangi kendi firmamıza (MyCompany) ait. Opsiyonel. */
    @JsonProperty("owner_my_company_id")
    private UUID ownerMyCompanyId;

    @JsonProperty("bank_name")
    @Size(max = 120)
    private String bankName;

    /** Default komisyon oranı yüzde (BANKA oranı). */
    @JsonProperty("default_rate")
    private BigDecimal defaultRate;

    /**
     * v1.7.x (POS Komisyon WP TODO 1bb4529a): Bizim komisyon oranı default —
     * yeni POS tx pre-fill. Validation: {@code our_commission_rate >= default_rate}.
     */
    @JsonProperty("our_commission_rate")
    private BigDecimal ourCommissionRate;

    private String notes;
}
