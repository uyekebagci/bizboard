package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.entity.AuditLog;
import com.bizboard.repository.AuditLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * Persists audit records.
 *
 * <p>Each record is written in its OWN transaction ({@code REQUIRES_NEW}) so
 * audit logging never rolls back a business operation — a download or upload
 * should still succeed even if the audit insert fails. Failures are logged
 * but swallowed (best-effort audit).</p>
 *
 * <p>This service auto-captures {@link HttpServletRequest} via a request-scoped
 * Spring proxy ({@link ObjectProvider}), so callers don't need to thread the
 * request through their methods. From non-HTTP contexts (e.g. {@code @Scheduled}
 * jobs) the IP / UA fields are simply left null.</p>
 */
@Slf4j
@Service
public class AuditLogService {

    private final AuditLogRepository repository;
    private final ObjectProvider<HttpServletRequest> requestProvider;

    @Autowired
    public AuditLogService(AuditLogRepository repository,
                           ObjectProvider<HttpServletRequest> requestProvider) {
        this.repository = repository;
        this.requestProvider = requestProvider;
    }

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

    /**
     * Genel amaçlı entity action helper. Tüm yeni audit'ler bunu çağırır.
     *
     * @param action       AuditAction.* sabitlerinden biri
     * @param userId       aksiyonu yapan kullanıcı
     * @param userName     denormalize username (forensik için)
     * @param resourceType "TRANSACTION", "BUSINESS", "USER", "EMPLOYEE", "DEBT", "FILE", vb.
     * @param resourceId   etkilenen kaynağın id'si (yoksa null)
     * @param detail       insan-okur kısa özet (örn. "Çakırdağ A.Ş. — 250₺ gelir, kategori: Satış")
     * @param metadata     yapısal alanlar — JSONB sütununa düşer; tip ve değer korunur
     */
    public void recordEntityAction(String action,
                                   UUID userId, String userName,
                                   String resourceType, UUID resourceId,
                                   String detail,
                                   Map<String, Object> metadata) {
        HttpServletRequest req = currentRequest();
        AuditLog entry = AuditLog.builder()
                .userId(userId)
                .userName(userName)
                .action(action)
                .resourceType(resourceType)
                .resourceId(resourceId)
                .ipAddress(clientIp(req))
                .userAgent(truncate(headerOrNull(req, "User-Agent"), 512))
                .detail(truncate(detail, 1024))
                .metadata(metadata)
                .build();
        record(entry);
    }

    /** Auth events (login_success/failed, logout). */
    public void recordAuthEvent(String action, UUID userId, String userName, String detail,
                                Map<String, Object> metadata) {
        HttpServletRequest req = currentRequest();
        AuditLog entry = AuditLog.builder()
                .userId(userId)
                .userName(userName)
                .action(action)
                .resourceType("USER")
                .resourceId(userId)
                .ipAddress(clientIp(req))
                .userAgent(truncate(headerOrNull(req, "User-Agent"), 512))
                .detail(truncate(detail, 1024))
                .metadata(metadata)
                .build();
        record(entry);
    }

    /** Convenience: password change action. */
    public void recordPasswordChange(UUID userId, String userName,
                                     int revokedSessions,
                                     HttpServletRequest request) {
        AuditLog entry = AuditLog.builder()
                .userId(userId)
                .userName(userName)
                .action(AuditAction.PASSWORD_CHANGED)
                .resourceType("USER")
                .resourceId(userId)
                .ipAddress(clientIp(request))
                .userAgent(truncate(request != null ? request.getHeader("User-Agent") : null, 512))
                .detail("Password changed; all active sessions revoked.")
                .metadata(Map.of("revokedSessions", revokedSessions))
                .build();
        record(entry);
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

    // ── helpers ──────────────────────────────────────────────────────────

    /** Current HTTP request via Spring's request-scoped proxy, or null if no active request. */
    private HttpServletRequest currentRequest() {
        try {
            return requestProvider.getIfAvailable();
        } catch (Exception e) {
            // Non-HTTP thread (@Scheduled, async task) — return null, fields will be null.
            return null;
        }
    }

    private static String headerOrNull(HttpServletRequest req, String name) {
        return req == null ? null : req.getHeader(name);
    }

    /** Returns the originating IP, honouring X-Forwarded-For. */
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
