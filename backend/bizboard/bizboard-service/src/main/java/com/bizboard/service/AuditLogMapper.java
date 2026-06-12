package com.bizboard.service;

import com.bizboard.common.dto.AuditLogDto;
import com.bizboard.common.entity.AuditLog;

import java.util.UUID;

/**
 * AuditLog entity → AuditLogDto dönüşümü için tek kaynak (mod-audit v2).
 *
 * <p>Daha önce bu mantık {@code AuditLogQueryService} içinde gömülüydü; SSE
 * stream ve export de aynı dönüşüme ihtiyaç duyduğu için ortak hale getirildi
 * (DRY). Dış sözleşme (snake_case JSON alanları) değişmez.</p>
 */
final class AuditLogMapper {

    private AuditLogMapper() {}

    static AuditLogDto toDto(AuditLog a) {
        return AuditLogDto.builder()
                .id(a.getId())
                .occurredAt(a.getCreatedAt())
                .traceId(null) // request tracing ileride
                .actorUserId(a.getUserId())
                .actorUsername(a.getUserName())
                .action(a.getAction())
                .entityType(a.getResourceType())
                .entityId(a.getResourceId())
                .businessId(extractBusinessId(a))
                .ip(a.getIpAddress())
                .userAgent(a.getUserAgent())
                .detail(a.getDetail())
                .highlightType(a.getHighlightType())
                .metadata(a.getMetadata())
                .build();
    }

    /** metadata.businessId — UUID ya da String olarak tutulmuş olabilir. */
    static UUID extractBusinessId(AuditLog a) {
        if (a.getMetadata() == null) return null;
        Object b = a.getMetadata().get("businessId");
        if (b instanceof UUID u) {
            return u;
        }
        if (b instanceof String s && !s.isBlank()) {
            try {
                return UUID.fromString(s);
            } catch (IllegalArgumentException ignored) {
                return null;
            }
        }
        return null;
    }
}
