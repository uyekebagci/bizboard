package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class FileUploadDto {

    private UUID id;

    @JsonProperty("original_name")
    private String originalName;

    @JsonProperty("content_type")
    private String contentType;

    private long size;

    private String category;

    private String description;

    @JsonProperty("admin_only")
    private boolean adminOnly;

    @JsonProperty("entity_type")
    private String entityType;

    @JsonProperty("entity_id")
    private UUID entityId;

    /** İlişkili işletme adı (join ile doldurulur) */
    @JsonProperty("business_name")
    private String businessName;

    private String url;

    @JsonProperty("uploaded_by_name")
    private String uploadedByName;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
