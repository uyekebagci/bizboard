package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Admin audit viewer için tek bir kayıt.
 *
 * <p>JSON alan adları frontend type'ı ({@code AuditLog} in {@code types/index.ts})
 * ile bire bir eşleşir. Backend entity ({@link com.bizboard.common.entity.AuditLog})
 * farklı isimlendirme kullanır (resource_type, user_id, …) ama dış sözleşme
 * frontend dostu kalır.</p>
 *
 * <p>İçeride olmayan alanlar: {@code trace_id} (henüz request tracing yok),
 * {@code business_id} (entity'de yok — v1.x'te eklenebilir).</p>
 */
@Data
@Builder
public class AuditLogDto {

    private UUID id;

    @JsonProperty("occurred_at")
    private LocalDateTime occurredAt;

    @JsonProperty("trace_id")
    private String traceId;

    @JsonProperty("actor_user_id")
    private UUID actorUserId;

    @JsonProperty("actor_username")
    private String actorUsername;

    private String action;

    @JsonProperty("entity_type")
    private String entityType;

    @JsonProperty("entity_id")
    private UUID entityId;

    @JsonProperty("business_id")
    private UUID businessId;

    private String ip;

    @JsonProperty("user_agent")
    private String userAgent;

    private String detail;

    private Map<String, Object> metadata;
}
