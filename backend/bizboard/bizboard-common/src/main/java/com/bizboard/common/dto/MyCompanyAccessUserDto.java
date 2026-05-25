package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class MyCompanyAccessUserDto {
    @JsonProperty("access_id") private UUID accessId;
    @JsonProperty("user_id") private UUID userId;
    private String username;
    @JsonProperty("full_name") private String fullName;
    @JsonProperty("granted_at") private LocalDateTime grantedAt;
    @JsonProperty("granted_by_username") private String grantedByUsername;
}
