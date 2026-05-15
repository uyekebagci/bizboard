package com.bizboard.common.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** Body schema for {@code POST /me/password}. */
@Data
public class ChangePasswordRequest {

    @NotBlank
    private String currentPassword;

    /**
     * Yeni şifre. Minimum 8 karakter — politika ileride sertleştirilecek
     * (özel karakter, sayı, üst-alt harf zorunlu) v1.3.0'da.
     */
    @NotBlank
    @Size(min = 8, max = 128)
    private String newPassword;
}
