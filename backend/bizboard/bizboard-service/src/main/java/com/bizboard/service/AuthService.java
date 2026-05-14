package com.bizboard.service;

import com.bizboard.common.dto.AuthRequest;
import com.bizboard.common.dto.AuthResponse;
import com.bizboard.common.entity.RefreshToken;
import com.bizboard.common.entity.User;
import com.bizboard.repository.UserRepository;
import com.bizboard.security.JwtUtil;
import com.bizboard.service.RefreshTokenService.Issued;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;
    private final AuthenticationManager authenticationManager;
    private final RefreshTokenService refreshTokenService;

    /**
     * Login: erişim token'ı + yeni refresh token üretir.
     * Controller, döndürülen {@link LoginResult#refreshIssued()} ile cookie set eder.
     */
    @Transactional
    public LoginResult login(AuthRequest request, HttpServletRequest httpRequest) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword()));

        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new IllegalArgumentException("Invalid credentials"));

        String accessToken = jwtUtil.generateToken(
                user.getId(), user.getUsername(), user.getRole(), user.getAccessibleBusinesses());

        Issued refresh = refreshTokenService.issue(user.getId(), httpRequest);

        AuthResponse body = AuthResponse.builder()
                .token(accessToken)
                .expiresInSeconds(jwtUtil.getExpirationSeconds())
                // "İlk girişte parola değiştir" akışı henüz yok; her zaman false.
                .forcePasswordChange(false)
                .build();

        return new LoginResult(body, refresh);
    }

    /**
     * Refresh: sunulan plaintext token'ı doğrular, rotate eder, yeni access döner.
     */
    @Transactional
    public LoginResult refresh(String refreshPlaintext, HttpServletRequest httpRequest) {
        RefreshToken stored = refreshTokenService.validate(refreshPlaintext);
        User user = userRepository.findById(stored.getUserId())
                .orElseThrow(() -> new IllegalStateException("User no longer exists"));

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
        refreshTokenService.revoke(refreshPlaintext);
    }

    /** Login/refresh sonucunun controller'a teslim edilen taşıyıcı sınıfı. */
    public record LoginResult(AuthResponse body, Issued refreshIssued) {}
}
