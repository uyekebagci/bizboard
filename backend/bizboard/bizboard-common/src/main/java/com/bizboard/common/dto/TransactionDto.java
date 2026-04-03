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
