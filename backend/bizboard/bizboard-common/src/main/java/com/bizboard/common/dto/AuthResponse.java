package com.bizboard.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

/**
 * Login / refresh endpoint response.
 *
 * <p>Spring Jackson varsayılan ayarıyla bu alanlar JSON'da camelCase olur:
 * {@code { "token": "...", "expiresInSeconds": 604800, "forcePasswordChange": false }}.
 * Frontend bu sözleşmeyle eşleşmelidir.</p>
 */
@Data
@Builder
@AllArgsConstructor
public class AuthResponse {

    /** JWT access token (Authorization: Bearer ile gönderilir). */
    private String token;

    /** Token geçerlilik süresi (saniye). Client expiry hesabı için kullanır. */
    private long expiresInSeconds;

    /**
     * İlk girişte parola değişikliği zorunlu mu? Şu an her zaman {@code false};
     * "ilk giriş şifre zorla değiştir" akışı v1.x'te eklenecek.
     */
    private boolean forcePasswordChange;
}
