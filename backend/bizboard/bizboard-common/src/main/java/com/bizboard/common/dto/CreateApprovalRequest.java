package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.Map;
import java.util.UUID;

/**
 * Onay (Approval) modülü v1.1: {@code POST /approvals} gövdesi — jenerik onay
 * talebi oluşturma.
 *
 * <p>{@code actionType} onaya tabi işlemin türüdür (örn. {@code BALANCE_ADJUST}).
 * {@code payload} onaylanınca işlemi yeniden kurup yürütmek için gereken tüm
 * girdileri taşır (JSONB). {@code requireVerifyCode=true} ise servis bir TTL'li
 * doğrulama kodu üretir; onaydan önce {@code /verify-code} ile doğrulanmalıdır.</p>
 */
@Data
public class CreateApprovalRequest {

    /** Onayın bağlı olacağı işletme — STRICT tenant-scope (zorunlu). */
    @NotNull(message = "business_id zorunlu")
    @JsonProperty("business_id")
    private UUID businessId;

    /** Onaya tabi işlemin türü (örn. BALANCE_ADJUST). */
    @NotNull(message = "action_type zorunlu")
    @Size(min = 1, max = 64, message = "action_type 1-64 karakter olmalı")
    @JsonProperty("action_type")
    private String actionType;

    /** İnsan-okur kısa özet (liste/detayda gösterilir). */
    @Size(max = 512, message = "title en fazla 512 karakter olabilir")
    private String title;

    /** Onaylanınca işlemi yürütmek için gereken girdiler. */
    private Map<String, Object> payload;

    /** TTL'li doğrulama kodu istensin mi? (default false). */
    @JsonProperty("require_verify_code")
    private boolean requireVerifyCode;

    /** Tüm talebin onay-akışı TTL'i (dakika). null/0 = süresiz. */
    @JsonProperty("expires_in_minutes")
    private Integer expiresInMinutes;
}
