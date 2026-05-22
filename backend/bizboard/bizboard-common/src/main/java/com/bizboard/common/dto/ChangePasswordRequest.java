package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
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
     * Yeni şifre — v1.7.x: kısıtlama kaldırıldı (kullanıcı talebi).
     * Yalnız boş olmaması yeterli.
     */
    @NotBlank
    @JsonProperty("new_password")
    private String newPassword;
}
