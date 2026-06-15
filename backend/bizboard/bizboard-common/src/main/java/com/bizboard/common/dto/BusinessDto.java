package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
public class BusinessDto {

    private UUID id;

    @JsonProperty("owner_id")
    private UUID ownerId;

    /**
     * v1.6.2: serbest metin işletme tipi adı (eski BusinessType FK kaldırıldı).
     */
    @JsonProperty("business_type_name")
    private String businessTypeName;

    private String name;
    private String description;

    @JsonProperty("logo_url")
    private String logoUrl;

    private String color;
    private String currency;

    @JsonProperty("is_active")
    private boolean active;

    /** Soft-delete / arşiv bayrağı — {@code true} ise işletme arşivlenmiş. */
    private boolean archived;

    private Map<String, Object> metadata;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;

    private List<BusinessMemberDto> members;
    private List<BusinessModuleDto> modules;
}
