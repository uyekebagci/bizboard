package com.bizboard.api.controller;

import com.bizboard.common.dto.AuthRequest;
import com.bizboard.common.dto.AuthResponse;
import com.bizboard.service.AuthService;
import com.bizboard.service.AuthService.LoginResult;
import com.bizboard.service.LoginRateLimiter;
import com.bizboard.service.RefreshTokenService.InvalidRefreshTokenException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @Value("${app.refresh.cookie.name:rt}")
    private String cookieName;

    @Value("${app.refresh.cookie.secure:true}")
    private boolean cookieSecure;

    /**
     * SameSite değeri. Frontend ve backend farklı domain'lerdeyse (cross-site
     * AJAX) {@code None} olmalı. Aynı site/parent domain ise {@code Lax} yeterli
     * ve daha güvenli.
     */
    @Value("${app.refresh.cookie.same-site:None}")
    private String cookieSameSite;

    @Value("${app.refresh.cookie.path:/auth}")
    private String cookiePath;

    @Value("${app.refresh.cookie.domain:}")
    private String cookieDomain;

    /** Login: credentials → access token + refresh cookie. */
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody AuthRequest request,
            HttpServletRequest httpRequest) {
        LoginResult result = authService.login(request, httpRequest);
        ResponseCookie cookie = buildCookie(
                result.refreshIssued().plaintext(),
                result.refreshIssued().expiresAt());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(result.body());
    }

    /**
     * Silent refresh: cookie'deki refresh token ile yeni access token al.
     * Rotation aktif — eski refresh revoke olur, yeni plaintext set-cookie ile döner.
     */
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(
            @CookieValue(name = "${app.refresh.cookie.name:rt}", required = false) String refreshToken,
            HttpServletRequest httpRequest) {
        if (refreshToken == null || refreshToken.isBlank()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            LoginResult result = authService.refresh(refreshToken, httpRequest);
            ResponseCookie cookie = buildCookie(
                    result.refreshIssued().plaintext(),
                    result.refreshIssued().expiresAt());
            return ResponseEntity.ok()
                    .header(HttpHeaders.SET_COOKIE, cookie.toString())
                    .body(result.body());
        } catch (InvalidRefreshTokenException e) {
            // Geçersiz / expired / revoke edilmiş token — cookie'yi temizleyerek 401 dön.
            ResponseCookie cleared = clearCookie();
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .header(HttpHeaders.SET_COOKIE, cleared.toString())
                    .build();
        }
    }

    /**
     * Rate-limit kilidi devreye girince 429 dön. Body'de yeniden deneme süresi
     * (saniye) hem JSON'da hem {@code Retry-After} header'ında var.
     */
    @ExceptionHandler(LoginRateLimiter.TooManyAttemptsException.class)
    public ResponseEntity<Map<String, Object>> handleTooManyAttempts(LoginRateLimiter.TooManyAttemptsException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()))
                .body(Map.of(
                        "code", "AUTH-LOCKED",
                        "message", "Cok fazla basarisiz deneme. Lutfen " + ex.getRetryAfterSeconds() + " saniye sonra tekrar deneyin.",
                        "retryAfterSeconds", ex.getRetryAfterSeconds()
                ));
    }

    /** Logout: refresh token'ı DB'de revoke + cookie temizle. */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = "${app.refresh.cookie.name:rt}", required = false) String refreshToken) {
        if (refreshToken != null) {
            authService.logout(refreshToken);
        }
        ResponseCookie cleared = clearCookie();
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cleared.toString())
                .build();
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private ResponseCookie buildCookie(String value, LocalDateTime expiresAt) {
        long maxAge = Math.max(0,
                expiresAt.toEpochSecond(ZoneOffset.UTC) - LocalDateTime.now().toEpochSecond(ZoneOffset.UTC));
        ResponseCookie.ResponseCookieBuilder b = ResponseCookie.from(cookieName, value)
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSameSite)
                .path(cookiePath)
                .maxAge(Duration.ofSeconds(maxAge));
        if (cookieDomain != null && !cookieDomain.isBlank()) {
            b.domain(cookieDomain);
        }
        return b.build();
    }

    private ResponseCookie clearCookie() {
        ResponseCookie.ResponseCookieBuilder b = ResponseCookie.from(cookieName, "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSameSite)
                .path(cookiePath)
                .maxAge(0);
        if (cookieDomain != null && !cookieDomain.isBlank()) {
            b.domain(cookieDomain);
        }
        return b.build();
    }
}
