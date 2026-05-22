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

    /**
     * v1.7.0-beta (Bankalar WP TODO 0aa4c6d1): "NORMAL" | "TRANSFER".
     * UI badge + tx listesi'nde transfer'leri ayırt etmek için.
     */
    private String kind;

    /**
     * v1.7.0-beta: Transfer pair UUID (kind=TRANSFER ise NOT NULL). UI tx
     * satırına tıklayınca TransferDetailModal'i bu ile açar.
     */
    @JsonProperty("transfer_pair_id")
    private UUID transferPairId;

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

    /**
     * v1.6.23.9 (TODO 6ee7a9f1): POS tx hesaba düştüğünde damga.
     * pos_settled=true iken doldurulur.
     */
    @JsonProperty("settled_at")
    private LocalDateTime settledAt;

    /** v1.6.23.9: settle sonrası hangi banka hesabına düştü (null=henüz settle olmadı). */
    @JsonProperty("settled_bank_account_id")
    private UUID settledBankAccountId;

    @JsonProperty("settled_bank_account_name")
    private String settledBankAccountName;

    /**
     * v1.6.23.8 (WP 3cdf2a4f / TODO ad8afc6f): POS tx için derived komisyon.
     * Formül: {@code amount × applied_pos_rate / 100} (applied_pos_rate yoksa
     * pos_rate fallback). NAKIT/HESAPDAN için null. Tx list'lerde net göstermek
     * isteyen UI bu field'ı okumalı — gross göstermek isterse {@code amount}.
     */
    @JsonProperty("pos_commission")
    private BigDecimal posCommission;

    /**
     * v1.6.23.8: POS tx için derived net (= amount − pos_commission).
     * Bank account'a düşen gerçek tutar. NAKIT/HESAPDAN için null.
     */
    @JsonProperty("pos_net")
    private BigDecimal posNet;

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
