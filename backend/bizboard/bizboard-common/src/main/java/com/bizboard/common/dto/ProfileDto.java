package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class ProfileDto {

    private UUID id;

    @JsonProperty("full_name")
    private String fullName;

    @JsonProperty("avatar_url")
    private String avatarUrl;

    private String phone;

    @JsonProperty("preferred_currency")
    private String preferredCurrency;

    @JsonProperty("preferred_language")
    private String preferredLanguage;

    @JsonProperty("onboarding_completed")
    private boolean onboardingCompleted;

    private String role;

    /**
     * Kullanıcının görebileceği sidebar SAYFA anahtarları (page key). FE bunu
     * sidebar filtreleme + route guard için kullanır. {@code ["all"]} → tüm
     * sayfalar (default-permissive; admin her zaman böyle). Navigasyon seviyesi;
     * sayfa endpoint RBAC'ından ayrı.
     */
    @JsonProperty("allowed_pages")
    private List<String> allowedPages;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
}
