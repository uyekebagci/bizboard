package com.bizboard.service;

import com.bizboard.common.entity.AuditLog;
import com.bizboard.repository.AuditLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * Persists audit records. Each record is written in its OWN transaction
 * ({@code REQUIRES_NEW}) so audit logging never rolls back a business operation —
 * a download or upload should still succeed even if the audit insert fails.
 *
 * <p>Failures are logged but swallowed (best-effort audit). For compliance regimes
 * that require atomic audit, switch to {@code Propagation.MANDATORY} and accept
 * that audit failures roll back the action.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditLogService {

    private final AuditLogRepository repository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(AuditLog entry) {
        try {
            repository.save(entry);
        } catch (Exception e) {
            // Audit must never fail the business request.
            log.warn("[audit] failed to persist entry action={} resourceId={}: {}",
                    entry.getAction(), entry.getResourceId(), e.getMessage());
        }
    }

    /** Convenience builder for the common case of a file action. */
    public void recordFileAction(String action,
                                 UUID userId, String userName,
                                 UUID fileId, String fileName, long sizeBytes,
                                 HttpServletRequest request) {
        AuditLog entry = AuditLog.builder()
                .userId(userId)
                .userName(userName)
                .action(action)
                .resourceType("FILE")
                .resourceId(fileId)
                .ipAddress(clientIp(request))
                .userAgent(truncate(request != null ? request.getHeader("User-Agent") : null, 512))
                .detail(fileName)
                .metadata(sizeBytes > 0 ? Map.of("sizeBytes", sizeBytes) : null)
                .build();
        record(entry);
    }

    /**
     * Returns the originating IP, honouring X-Forwarded-For (set by Sevalla's edge / reverse proxy).
     */
    private static String clientIp(HttpServletRequest req) {
        if (req == null) return null;
        String fwd = req.getHeader("X-Forwarded-For");
        if (fwd != null && !fwd.isBlank()) {
            int comma = fwd.indexOf(',');
            return truncate(comma > 0 ? fwd.substring(0, comma).trim() : fwd.trim(), 64);
        }
        return truncate(req.getRemoteAddr(), 64);
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
