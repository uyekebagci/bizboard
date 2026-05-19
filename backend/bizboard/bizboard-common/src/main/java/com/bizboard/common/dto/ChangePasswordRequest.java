package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Body schema for {@code POST /me/password}.
 *
 * v1.6.10.1: Frontend snake_case (`current_password` / `new_password`) gönderiyor;
 * projedeki diğer DTO'larla uyumlu olması için `@JsonProperty` ile mapping eklendi
 * (proje genelinde `spring.jackson.property-naming-strategy=SNAKE_CASE` yok,
 * her DTO kendi alan mapping'ini taşır). Annotation eksikliğinde Jackson alanları
 * eşleştiremiyor ve `@NotBlank` "boş değer olamaz" hatası fırlatıyordu —
 * özellikle zorunlu şifre değişimi akışında non-admin kullanıcıları kilitliyordu.
 */
@Data
public class ChangePasswordRequest {

    @NotBlank
    @JsonProperty("current_password")
    private String currentPassword;

    /**
     * Yeni şifre. Minimum 8 karakter — politika ileride sertleştirilecek
     * (özel karakter, sayı, üst-alt harf zorunlu) v1.3.0'da.
     */
    @NotBlank
    @Size(min = 8, max = 128)
    @JsonProperty("new_password")
    private String newPassword;
}
