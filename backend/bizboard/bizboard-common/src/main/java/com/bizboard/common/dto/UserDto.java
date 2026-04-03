package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class UserDto {

    private UUID id;
    private String username;

    @JsonProperty("full_name")
    private String fullName;

    private String role;

    @JsonProperty("is_active")
    private boolean active;

    @JsonProperty("business_ids")
    private List<UUID> businessIds;

    @JsonProperty("business_names")
    private List<String> businessNames;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
