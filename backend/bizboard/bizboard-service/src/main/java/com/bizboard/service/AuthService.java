package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.AuthRequest;
import com.bizboard.common.dto.AuthResponse;
import com.bizboard.common.entity.RefreshToken;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.NotificationType;
import com.bizboard.repository.NotificationRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.security.JwtUtil;
import com.bizboard.service.RefreshTokenService.Issued;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;
    private final AuthenticationManager authenticationManager;
    private final RefreshTokenService refreshTokenService;
    private final NotificationService notificationService;
    private final NotificationRepository notificationRepository;
    private final AuditLogService auditLogService;
    private final LoginRateLimiter loginRateLimiter;

    /**
     * Login: erişim token'ı + yeni refresh token üretir.
     * Controller, döndürülen {@link LoginResult#refreshIssued()} ile cookie set eder.
     */
    @Transactional
    public LoginResult login(AuthRequest request, HttpServletRequest httpRequest) {
        String username = request.getUsername();

        // Rate-limit kontrolü: çok fazla başarısız denemeden sonra kilit. Kullanıcı adı
        // mevcut olsun olmasın aynı limit uygulanır — username enumeration azaltır.
        if (loginRateLimiter.isLocked(username)) {
            long retry = loginRateLimiter.secondsUntilUnlock(username);
            auditLogService.recordAuthEvent(
                    AuditAction.USER_LOGIN_FAILED,
                    null,
                    username,
                    "Login blocked by rate limit for '" + username + "' (retry after " + retry + "s)",
                    Map.of(
                            "attemptedUsername", username != null ? username : "",
                            "reason", "RateLimited",
                            "retryAfterSeconds", retry
                    ));
            throw new LoginRateLimiter.TooManyAttemptsException(retry);
        }

        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(username, request.getPassword()));
        } catch (AuthenticationException ex) {
            // Sayacı artır.
            loginRateLimiter.recordFailure(username);

            Map<String, Object> meta = new HashMap<>();
            meta.put("attemptedUsername", username);
            meta.put("reason", ex.getClass().getSimpleName());
            auditLogService.recordAuthEvent(
                    AuditAction.USER_LOGIN_FAILED,
                    null,
                    username,
                    "Login failed for username '" + username + "': " + ex.getMessage(),
                    meta);
            throw ex;
        }

        // Başarılı → kilit sayacını sıfırla.
        loginRateLimiter.recordSuccess(username);

        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Invalid credentials"));

        String accessToken = jwtUtil.generateToken(
                user.getId(), user.getUsername(), user.getRole(), user.getAccessibleBusinesses());

        Issued refresh = refreshTokenService.issue(user.getId(), httpRequest);

        // İlk-giriş bildirimi tetikleyici: kullanıcının hiç bildirimi yoksa hoş geldin
        // mesajı oluştur. Bu, pipeline'ın çalıştığını doğrulayan en küçük tetikleyici.
        tryCreateFirstLoginNotification(user);

        auditLogService.recordAuthEvent(
                AuditAction.USER_LOGIN_SUCCESS,
                user.getId(), user.getUsername(),
                "Login successful for " + user.getUsername(),
                Map.of("role", user.getRole() != null ? user.getRole() : "viewer"));

        AuthResponse body = AuthResponse.builder()
                .token(accessToken)
                .expiresInSeconds(jwtUtil.getExpirationSeconds())
                .forcePasswordChange(user.isMustChangePassword())
                .build();

        return new LoginResult(body, refresh);
    }

    private void tryCreateFirstLoginNotification(User user) {
        try {
            long unread = notificationRepository.countByUserIdAndReadFalse(user.getId());
            long total = notificationRepository.findByUserIdOrderByCreatedAtDesc(user.getId()).size();
            if (total == 0 && unread == 0) {
                // v1.6.8: marka adı ÇATI.
                notificationService.create(
                        user.getId(),
                        NotificationType.INFO,
                        "CATI'ya hos geldin!",
                        "Hesabin hazir. Sol panelden yeni isletme ekleyerek baslayabilirsin.",
                        "/dashboard",
                        null,
                        "first-login"
                );
            }
        } catch (Exception e) {
            // Bildirim oluşturulamasa bile login başarısı etkilenmemeli.
            log.warn("[auth] first-login notification skipped for user {}: {}", user.getId(), e.getMessage());
        }
    }

    /**
     * Refresh: sunulan plaintext token'ı doğrular, rotate eder, yeni access döner.
     */
    @Transactional
    public LoginResult refresh(String refreshPlaintext, HttpServletRequest httpRequest) {
        RefreshToken stored = refreshTokenService.validate(refreshPlaintext);
        User user = userRepository.findById(stored.getUserId())
                .orElseThrow(() -> new IllegalStateException("User no longer exists"));

        // Pasifleştirilmiş kullanıcı refresh edemez. RefreshToken aktif olsa bile
        // user.active=false ise token sahibi sistem dışı; controller 401 + cookie clear yapar.
        if (!user.isActive()) {
            throw new com.bizboard.service.RefreshTokenService.InvalidRefreshTokenException(
                    "user is not active");
        }

        Issued rotated = refreshTokenService.rotate(stored, httpRequest);

        String accessToken = jwtUtil.generateToken(
                user.getId(), user.getUsername(), user.getRole(), user.getAccessibleBusinesses());

        AuthResponse body = AuthResponse.builder()
                .token(accessToken)
                .expiresInSeconds(jwtUtil.getExpirationSeconds())
                .forcePasswordChange(false)
                .build();

        return new LoginResult(body, rotated);
    }

    /** Logout: refresh token'ı DB'de revoke eder; controller cookie'yi temizler. */
    @Transactional
    public void logout(String refreshPlaintext) {
        // Önce refresh token'ın hangi kullanıcıya ait olduğunu öğrenelim — audit için.
        UUID userId = null;
        String userName = null;
        try {
            RefreshToken stored = refreshTokenService.validate(refreshPlaintext);
            userId = stored.getUserId();
            userRepository.findById(userId).ifPresent(u -> {
                // No-op, just to confirm user exists. userName captured below if non-null.
            });
        } catch (Exception ignored) {
            // Geçersiz token bile gelse logout yine de cookie'yi temizler — sadece audit kullanıcısız düşer.
        }
        if (userId != null) {
            User user = userRepository.findById(userId).orElse(null);
            if (user != null) userName = user.getUsername();
        }

        refreshTokenService.revoke(refreshPlaintext);

        auditLogService.recordAuthEvent(
                AuditAction.USER_LOGOUT,
                userId, userName,
                userId != null ? "User logged out" : "Logout with unknown/invalid refresh token",
                null);
    }

    /** Login/refresh sonucunun controller'a teslim edilen taşıyıcı sınıfı. */
    public record LoginResult(AuthResponse body, Issued refreshIssued) {}
}
