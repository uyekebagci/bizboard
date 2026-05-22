package com.bizboard.common.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AuthRequest {

    @NotBlank
    private String username;

    // v1.7.x: şifre kısıtlamaları kaldırıldı (kullanıcı talebi).
    // Yalnız boş olmaması yeterli; min/max yok.
    @NotBlank
    private String password;
}
