package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.entity.AuditLog;
import com.bizboard.common.entity.RefreshToken;
import com.bizboard.repository.RefreshTokenRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.codec.Hex;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.UUID;

/**
 * Refresh token üretimi, doğrulaması, rotasyonu ve iptali.
 *
 * <p>Tasarım kararları:</p>
 * <ul>
 *   <li><b>Plaintext sadece cookie'de.</b> DB'de yalnız SHA-256 hash saklanır;
 *       DB sızıntısında bile token'lar yeniden kullanılamaz.</li>
 *   <li><b>Rotation:</b> her refresh çağrısında eski token revoke edilir ve
 *       yeni token üretilir. {@code replacedById} alanı zinciri tutar.</li>
 *   <li><b>256 bit entropi:</b> 32 byte secure random + base64url encoding.</li>
 *   <li><b>Audit:</b> hangi IP/UA ile oluşturulduğu kaydedilir.</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RefreshTokenService {

    private final RefreshTokenRepository repository;
    private final AuditLogService auditLogService;

    @Value("${app.refresh.duration-days:30}")
    private long durationDays;

    private final SecureRandom random = new SecureRandom();

    /** Yeni token üret ve kaydet. */
    @Transactional
    public Issued issue(UUID userId, HttpServletRequest request) {
        String plaintext = generatePlaintext();
        LocalDateTime expiresAt = LocalDateTime.now().plusDays(durationDays);

        RefreshToken entity = RefreshToken.builder()
                .userId(userId)
                .tokenHash(hash(plaintext))
                .expiresAt(expiresAt)
                .userAgent(truncate(headerOrNull(request, "User-Agent"), 512))
                .ipAddress(truncate(clientIp(request), 64))
                .build();
        repository.save(entity);

        return new Issued(plaintext, expiresAt, entity);
    }

    /**
     * Sunulan plaintext token'ı doğrula.
     *
     * <p><b>Theft detection:</b> Revoke edilmiş bir token tekrar kullanılırsa
     * bu, başarılı bir token sızıntısının kanıtıdır (gerçek kullanıcı zaten
     * yenilemiş, eski token'ı yalnız hırsız taşıyor olabilir). Bu durumda
     * o kullanıcının TÜM aktif refresh token'larını revoke edip oturumu
     * agresif şekilde kapatırız. Audit log düşülür ki güvenlik ekibi olayı
     * görebilsin.</p>
     *
     * @return geçerli entity
     * @throws InvalidRefreshTokenException token yok/revoke/expired
     */
    @Transactional
    public RefreshToken validate(String plaintext) {
        if (plaintext == null || plaintext.isBlank()) {
            throw new InvalidRefreshTokenException("missing");
        }
        RefreshToken stored = repository.findByTokenHash(hash(plaintext))
                .orElseThrow(() -> new InvalidRefreshTokenException("not found"));

        if (stored.isRevoked()) {
            handleTheft(stored);
            throw new InvalidRefreshTokenException("revoked");
        }
        if (stored.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new InvalidRefreshTokenException("expired");
        }
        return stored;
    }

    /**
     * Revoke edilmiş bir token tekrar geldi → tüm zinciri yık.
     */
    private void handleTheft(RefreshToken revokedReuse) {
        int revoked = repository.revokeAllForUser(revokedReuse.getUserId(), LocalDateTime.now());
        log.warn("[refresh] THEFT DETECTED user={} reused-token-id={} revoked-active-count={} ip={}",
                revokedReuse.getUserId(), revokedReuse.getId(), revoked, revokedReuse.getIpAddress());

        auditLogService.record(AuditLog.builder()
                .userId(revokedReuse.getUserId())
                .action(AuditAction.REFRESH_TOKEN_THEFT_DETECTED)
                .resourceType("REFRESH_TOKEN")
                .resourceId(revokedReuse.getId())
                .ipAddress(revokedReuse.getIpAddress())
                .userAgent(revokedReuse.getUserAgent())
                .detail("Reuse of revoked refresh token detected; all active sessions for this user have been revoked.")
                .metadata(Map.of(
                        "revokedSessions", revoked,
                        "reusedTokenCreatedAt", revokedReuse.getCreatedAt().toString()
                ))
                .build());
    }

    /**
     * Rotation: eski token revoke edilir, yeni token üretilir, ikisi zincirle bağlanır.
     */
    @Transactional
    public Issued rotate(RefreshToken oldToken, HttpServletRequest request) {
        Issued fresh = issue(oldToken.getUserId(), request);

        oldToken.setRevoked(true);
        oldToken.setRevokedAt(LocalDateTime.now());
        oldToken.setReplacedById(fresh.entity().getId());
        repository.save(oldToken);

        return fresh;
    }

    /** Tek bir token'ı revoke et (logout). */
    @Transactional
    public void revoke(String plaintext) {
        if (plaintext == null || plaintext.isBlank()) return;
        repository.findByTokenHash(hash(plaintext)).ifPresent(token -> {
            if (!token.isRevoked()) {
                token.setRevoked(true);
                token.setRevokedAt(LocalDateTime.now());
                repository.save(token);
            }
        });
    }

    /** Kullanıcının tüm aktif token'larını revoke et (global logout / parola değiştirme). */
    @Transactional
    public int revokeAllForUser(UUID userId) {
        return repository.revokeAllForUser(userId, LocalDateTime.now());
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private String generatePlaintext() {
        byte[] buf = new byte[32]; // 256 bit
        random.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    /** SHA-256 hex digest. Hash deterministik olduğu için tek-yön index'lenebilir. */
    private static String hash(String plaintext) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(plaintext.getBytes(StandardCharsets.UTF_8));
            return new String(Hex.encode(digest));
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 her JDK'da var; bu noktaya gelmek imkansız.
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    private static String headerOrNull(HttpServletRequest req, String name) {
        return req == null ? null : req.getHeader(name);
    }

    private static String clientIp(HttpServletRequest req) {
        if (req == null) return null;
        String fwd = req.getHeader("X-Forwarded-For");
        if (fwd != null && !fwd.isBlank()) {
            int comma = fwd.indexOf(',');
            return comma > 0 ? fwd.substring(0, comma).trim() : fwd.trim();
        }
        return req.getRemoteAddr();
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    /** Yeni üretilmiş bir refresh token'ın plaintext + meta bilgileri. */
    public record Issued(String plaintext, LocalDateTime expiresAt, RefreshToken entity) {
    }

    /** Refresh token doğrulamasının fail ettiği özel exception. */
    public static class InvalidRefreshTokenException extends RuntimeException {
        public InvalidRefreshTokenException(String reason) {
            super(reason);
        }
    }
}
