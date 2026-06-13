package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
public class UpdateUserRequest {

    @JsonProperty("full_name")
    private String fullName;

    private String password;

    @NotBlank
    private String role;

    @NotEmpty(message = "En az bir isletme secilmelidir")
    @JsonProperty("business_ids")
    private List<UUID> businessIds;

    @JsonProperty("is_active")
    private Boolean active;

    /**
     * Erişilebilir sidebar sayfa anahtarları (page key). {@code null} → değiştirme
     * (mevcut korunur). Boş liste → default-permissive (tüm sayfalar). Admin için
     * yok sayılır.
     */
    @JsonProperty("allowed_pages")
    private List<String> allowedPages;
}
