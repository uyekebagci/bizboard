package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class MyCompanyGroupDto {
    private UUID id;
    private String name;
    private String color;
    private String icon;
    @JsonProperty("order_index") private Integer orderIndex;
    @JsonProperty("firm_count") private Integer firmCount;
    @JsonProperty("created_at") private LocalDateTime createdAt;
}
