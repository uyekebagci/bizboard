package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class BusinessNoteDto {

    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    private String content;

    @JsonProperty("is_pinned")
    private boolean pinned;

    private String color;

    @JsonProperty("admin_only")
    private boolean adminOnly;

    /** WP a9da4e9d fix: "BUSINESS" veya "RECEIVABLES". */
    private String scope;

    @JsonProperty("created_by_name")
    private String createdByName;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
}
