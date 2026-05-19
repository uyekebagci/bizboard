package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * v1.6.11: BusinessGroupDto içinde üye olarak görünen işletme satırı.
 */
@Data
@Builder
public class BusinessGroupMemberDto {

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    @JsonProperty("order_in_group")
    private int orderInGroup;

    @JsonProperty("added_at")
    private LocalDateTime addedAt;
}
