package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * v1.6.11: GET /api/me/business-groups cevap satırı.
 */
@Data
@Builder
public class BusinessGroupDto {

    private UUID id;

    private String name;

    private String color;

    /** 0=PINNED, 1=HIGH, 2=NORMAL. */
    private int priority;

    @JsonProperty("order_index")
    private int orderIndex;

    /** Bu gruptaki işletmeler (orderInGroup ASC sıralı). */
    private List<BusinessGroupMemberDto> members;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
}
