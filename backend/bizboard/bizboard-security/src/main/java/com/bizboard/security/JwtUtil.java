package com.bizboard.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.UUID;

@Component
public class JwtUtil {

    private final SecretKey key;
    private final long expirationMs;

    public JwtUtil(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.expiration-ms:604800000}") long expirationMs) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }

    public String generateToken(UUID userId, String username, String role, String accessibleBusinesses) {
        Date now = new Date();
        var builder = Jwts.builder()
                .subject(userId.toString())
                .claim("username", username)
                .claim("role", role != null ? role : "viewer")
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expirationMs));

        if (accessibleBusinesses != null && !accessibleBusinesses.isBlank()) {
            builder.claim("businesses", accessibleBusinesses);
        }

        return builder.signWith(key).compact();
    }

    public String getRoleFromToken(String token) {
        Claims claims = parseToken(token);
        String role = claims.get("role", String.class);
        return role != null ? role : "viewer";
    }

    public UUID getUserIdFromToken(String token) {
        Claims claims = parseToken(token);
        return UUID.fromString(claims.getSubject());
    }

    public String getUsernameFromToken(String token) {
        Claims claims = parseToken(token);
        return claims.get("username", String.class);
    }

    public List<String> getBusinessesFromToken(String token) {
        Claims claims = parseToken(token);
        String businesses = claims.get("businesses", String.class);
        if (businesses == null || businesses.isBlank()) {
            return Collections.emptyList();
        }
        return Arrays.stream(businesses.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    public boolean validateToken(String token) {
        try {
            parseToken(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
