package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

/** v1.6.23.12: GET /phone-brands satırı. */
@Data @Builder
public class PhoneBrandDto {
    private UUID id;
    private String name;
    private String slug;
    @JsonProperty("sort_order") private int sortOrder;
    @JsonProperty("is_active") private boolean active;
    /** v1.6.23.12: bu marka altındaki aktif model sayısı (UI dropdown'unda göstermek için opsiyonel). */
    @JsonProperty("model_count") private Integer modelCount;
}
