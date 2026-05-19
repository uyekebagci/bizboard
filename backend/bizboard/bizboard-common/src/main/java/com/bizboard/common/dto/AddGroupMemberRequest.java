package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

/**
 * v1.6.11: POST /api/me/business-groups/{groupId}/members body.
 */
@Data
public class AddGroupMemberRequest {

    @NotNull
    @JsonProperty("business_id")
    private UUID businessId;

    /** Opsiyonel; verilmezse grubun sonuna eklenir. */
    @JsonProperty("order_in_group")
    private Integer orderInGroup;
}
