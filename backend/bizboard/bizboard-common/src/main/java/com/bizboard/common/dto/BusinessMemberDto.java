package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
public class BusinessMemberDto {

    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("user_id")
    private UUID userId;

    private String role;

    @JsonProperty("invited_email")
    private String invitedEmail;

    @JsonProperty("is_accepted")
    private boolean accepted;

    private Map<String, Boolean> permissions;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
}
