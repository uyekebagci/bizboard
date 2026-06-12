package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Onay (Approval) modülü v1.1: {@code POST /approvals/{id}/verify-code} gövdesi.
 *
 * <p>Kod-zorunlu bir onay talebini onaydan önce doğrulamak için kullanılır.
 * Kod yanlış / süresi geçmişse servis 400 döner.</p>
 */
@Data
public class ApprovalVerifyCodeRequest {

    @NotNull(message = "code zorunlu")
    @Size(min = 1, max = 16, message = "code 1-16 karakter olmalı")
    @JsonProperty("code")
    private String code;
}
