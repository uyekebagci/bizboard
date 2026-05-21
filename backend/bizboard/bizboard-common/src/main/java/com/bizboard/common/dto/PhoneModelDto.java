package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

/** v1.6.23.12: GET /phone-models satırı. */
@Data @Builder
public class PhoneModelDto {
    private UUID id;
    @JsonProperty("brand_id") private UUID brandId;
    @JsonProperty("brand_name") private String brandName;
    private String name;
    @JsonProperty("release_year") private Integer releaseYear;
    @JsonProperty("is_active") private boolean active;
}
