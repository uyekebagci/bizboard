package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Onay (Approval) modülü v1.1 — onay talebi okuma DTO'su (Onay Kuyruğu + detay).
 *
 * <p>verify-code'un kendisi DTO'ya ASLA konmaz (güvenlik); yalnız "doğrulama
 * gerekli mi / doğrulandı mı" bayrakları döner.</p>
 */
@Data
@Builder
public class ApprovalDto {

    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    @JsonProperty("action_type")
    private String actionType;

    private String title;

    private Map<String, Object> payload;

    private String status;

    @JsonProperty("requested_by")
    private UUID requestedBy;

    @JsonProperty("requested_by_name")
    private String requestedByName;

    private UUID approver;

    @JsonProperty("approver_name")
    private String approverName;

    private String reason;

    /** Doğrulama kodu gerekli mi? (kodun kendisi DÖNMEZ) */
    @JsonProperty("verify_required")
    private boolean verifyRequired;

    /** Kod doğrulandı mı? */
    @JsonProperty("verified")
    private boolean verified;

    @JsonProperty("expires_at")
    private LocalDateTime expiresAt;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("decided_at")
    private LocalDateTime decidedAt;
}
