package com.bizboard.service;

import com.bizboard.common.dto.AuditLogDto;
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
                .map(AuditLogMapper::toDto);
    }
}
