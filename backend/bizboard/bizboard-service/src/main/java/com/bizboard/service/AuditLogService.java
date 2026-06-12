package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.entity.AuditLog;
import com.bizboard.repository.AuditLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * Persists audit records — <b>login-safe by construction</b> (mod-audit v2).
 *
 * <p><b>INCIDENT GEÇMİŞİ:</b> Önceki audit sürümü prod LOGIN'ini kırdı. Kök neden:
 * {@code record()} {@code REQUIRES_NEW} bir tx'ti ve içinde hash-chain hesabı
 * (önce bir DB sorgusu → auto-flush, sonra zincir alanlı save) yapıyordu. Zincir
 * yolunda bir flush/constraint hatası inner tx'i <i>rollback-only</i> işaretliyor,
 * lokal try-catch hatayı yutsa BİLE {@code REQUIRES_NEW} commit'i
 * {@link org.springframework.transaction.UnexpectedRollbackException} atıp çağıran
 * LOGIN akışını 500'e düşürüyordu (her login bir audit yazdığı için login tamamen
 * kırıldı).</p>
 *
 * <p><b>v2 TASARIM KURALI:</b> audit yazımı + hash-chain, çağıran iş akışını
 * (özellikle LOGIN) ASLA bozmamalı. Bunu iki katmanla garanti ederiz:</p>
 * <ol>
 *   <li><b>Yazım yolu zincirden tamamen ARINMIŞ:</b> {@code persist()} SADECE
 *       eski (kanıtlanmış-güvenli) baseline gibi {@code repository.save(entry)}
 *       yapar — hiçbir zincir hesabı, hiçbir ekstra sorgu/flush, hiçbir SSE publish.
 *       Hash-chain ayrı bir {@code @Scheduled} chainer tarafından insert'TEN SONRA
 *       hesaplanır (bkz. {@link AuditChainService}). Zincir alanları insert'te null.</li>
 *   <li><b>Defense-in-depth (commit-time guard):</b> public {@link #record} metodu
 *       NON-transactional'dır ve {@code REQUIRES_NEW} {@code persist()}'i SELF-proxy
 *       üzerinden çağırıp HER istisnayı (commit anında atılan
 *       {@code UnexpectedRollbackException} dahil) yutar. Metod-içi try-catch'in
 *       yakalayamadığı commit-time hata bile burada durur → çağıranı (login) ASLA
 *       etkilemez.</li>
 * </ol>
 *
 * <p>This service auto-captures {@link HttpServletRequest} via a request-scoped
 * Spring proxy ({@link ObjectProvider}); from non-HTTP contexts (e.g. {@code @Scheduled}
 * jobs) the IP / UA fields are simply left null.</p>
 */
@Slf4j
@Service
public class AuditLogService {

    private final AuditLogRepository repository;
    private final ObjectProvider<HttpServletRequest> requestProvider;
    /**
     * Self-referans (lazy → constructor döngüsü yok). public {@link #record}
     * non-transactional; {@code @Transactional} {@code persist()}'i proxy üzerinden
     * çağırmak ZORUNLU — aynı bean'de self-invocation proxy'yi bypass eder ve
     * REQUIRES_NEW devreye girmezdi. Proxy üzerinden çağrı + dıştaki try-catch,
     * commit-time {@code UnexpectedRollbackException}'ı çağıranın ulaşamayacağı
     * yerde durdurur.
     */
    private final AuditLogService self;

    @Autowired
    public AuditLogService(AuditLogRepository repository,
                           ObjectProvider<HttpServletRequest> requestProvider,
                           @Lazy AuditLogService self) {
        this.repository = repository;
        this.requestProvider = requestProvider;
        this.self = self;
    }

    /**
     * Audit kaydını best-effort yazar. NON-transactional + tüm istisnaları yutar.
     *
     * <p>Çağıran iş akışına (LOGIN) İSTİSNA SIZDIRMAZ — ne {@code persist()} içindeki
     * hata, ne de {@code REQUIRES_NEW} commit'inin atabileceği
     * {@code UnexpectedRollbackException}. {@code self} proxy'si üzerinden çağrı,
     * REQUIRES_NEW tx'inin commit/rollback'inin bu try bloğunun İÇİNDE gerçekleşmesini
     * sağlar; böylece commit-time hata da burada yakalanır.</p>
     */
    public void record(AuditLog entry) {
        try {
            self.persist(entry);
        } catch (Throwable t) {
            // Audit ASLA iş akışını (login) bozmamalı — commit-time
            // UnexpectedRollbackException dahil her şey burada durur.
            log.warn("[audit] persist swallowed (business flow protected) action={} resourceId={}: {}",
                    entry.getAction(), entry.getResourceId(), t.toString());
        }
    }

    /**
     * Tek-satır insert, kendi tx'inde ({@code REQUIRES_NEW}). SADECE save —
     * zincir/stream YOK. Bu metod {@link #record} dışından doğrudan çağrılmamalı;
     * {@code public} olması yalnız Spring proxy görünürlüğü içindir.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void persist(AuditLog entry) {
        repository.save(entry);
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
        recordEntityAction(action, userId, userName, resourceType, resourceId,
                detail, metadata, null);
    }

    /**
     * v1.6.19 (WP-2): highlight_type destekli overload.
     * Backdated tx, correction, closing reopen gibi özel vurgu gereken
     * eylemler için. Değerler için
     * {@link com.bizboard.common.audit.AuditAction#HIGHLIGHT_BACKDATED} vs. bak.
     */
    public void recordEntityAction(String action,
                                   UUID userId, String userName,
                                   String resourceType, UUID resourceId,
                                   String detail,
                                   Map<String, Object> metadata,
                                   String highlightType) {
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
                .highlightType(highlightType)
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
