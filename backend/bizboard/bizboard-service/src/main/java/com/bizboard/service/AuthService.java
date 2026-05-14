package com.bizboard.service;

import com.bizboard.common.dto.AuthRequest;
import com.bizboard.common.dto.AuthResponse;
import com.bizboard.common.entity.User;
import com.bizboard.repository.UserRepository;
import com.bizboard.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;
    private final AuthenticationManager authenticationManager;

    public AuthResponse login(AuthRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword()));

        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new IllegalArgumentException("Invalid credentials"));

        String token = jwtUtil.generateToken(
                user.getId(), user.getUsername(), user.getRole(), user.getAccessibleBusinesses());

        return AuthResponse.builder()
                .token(token)
                .expiresInSeconds(jwtUtil.getExpirationSeconds())
                // "İlk girişte parola değiştir" akışı henüz yok; her zaman false.
                // User entity'ye `force_password_change` kolonu eklenince burası true dönebilir.
                .forcePasswordChange(false)
                .build();
    }
}
