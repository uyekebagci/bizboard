package com.bizboard.service;

import com.bizboard.common.dto.AuditLogDto;
import com.bizboard.common.entity.AuditLog;
import com.bizboard.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Read-only audit log query service for the admin viewer endpoint.
 *
 * <p>Tüm filtreler opsiyonel. Sayfalama Pageable üzerinden controller'da yapılır;
 * cevap olarak {@link AuditLogDto} sayfası döner.</p>
 */
@Service
@RequiredArgsConstructor
public class AuditLogQueryService {

    private final AuditLogRepository repository;

    @Transactional(readOnly = true)
    public Page<AuditLogDto> search(UUID userId,
                                    String action,
                                    String resourceType,
                                    UUID businessId,
                                    LocalDateTime from,
                                    LocalDateTime to,
                                    Pageable pageable) {
        // A2: businessId metadata JSONB'de text olarak tutulur → string karşılaştırma.
        String businessIdStr = businessId != null ? businessId.toString() : null;
        return repository.search(userId, action, resourceType, businessIdStr, from, to, pageable)
                .map(this::toDto);
    }

    private AuditLogDto toDto(AuditLog a) {
        UUID businessId = null;
        if (a.getMetadata() != null) {
            Object b = a.getMetadata().get("businessId");
            if (b instanceof UUID u) {
                businessId = u;
            } else if (b instanceof String s && !s.isBlank()) {
                try { businessId = UUID.fromString(s); } catch (IllegalArgumentException ignored) {}
            }
        }
        return AuditLogDto.builder()
                .id(a.getId())
                .occurredAt(a.getCreatedAt())
                .traceId(null) // request tracing v2.0.0'da
                .actorUserId(a.getUserId())
                .actorUsername(a.getUserName())
                .action(a.getAction())
                .entityType(a.getResourceType())
                .entityId(a.getResourceId())
                .businessId(businessId)
                .ip(a.getIpAddress())
                .userAgent(a.getUserAgent())
                .detail(a.getDetail())
                .highlightType(a.getHighlightType())
                .metadata(a.getMetadata())
                .build();
    }
}
