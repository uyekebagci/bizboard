package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
public class TransactionDto {

    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("category_id")
    private UUID categoryId;

    private String direction;
    private BigDecimal amount;
    private String currency;
    private String description;
    private LocalDate date;

    @JsonProperty("receipt_url")
    private String receiptUrl;

    /** v1.5.6+: bu transaction bir kurulum maliyeti mi (one-time setup). */
    @JsonProperty("is_setup_cost")
    private boolean setupCost;

    /** v1.6.3: ödeme yöntemi "POS" veya "NAKIT" (default NAKIT). */
    @JsonProperty("payment_method")
    private String paymentMethod;

    /** v1.6.3: POS komisyon oranı (yüzde); NAKIT'te null. */
    @JsonProperty("pos_rate")
    private BigDecimal posRate;

    /** v1.6.21 (WP-4): snapshot at entry — cihaz oranı değişse de bu sabit. */
    @JsonProperty("applied_pos_rate")
    private BigDecimal appliedPosRate;

    /** v1.6.21 (WP-4): hangi POS cihazında çekildi. */
    @JsonProperty("pos_device_id")
    private UUID posDeviceId;

    @JsonProperty("pos_device_name")
    private String posDeviceName;

    /** v1.6.21 (WP-4): POS çekim banka hesabına düştü mü (true/false/null). */
    @JsonProperty("pos_settled")
    private Boolean posSettled;

    /** v1.6.20 (WP-3): karşı taraf (counterpart). */
    @JsonProperty("target_counterpart_id")
    private UUID targetCounterpartId;

    @JsonProperty("target_counterpart_name")
    private String targetCounterpartName;

    private List<String> tags;
    private Map<String, Object> metadata;

    @JsonProperty("created_by")
    private UUID createdBy;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;

    private CategoryDto category;

    @JsonProperty("business_name")
    private String businessName;
}
