package com.bizboard.common.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Onay (Approval) modülü v1.1: approve / reject / cancel gövdesi.
 *
 * <p>{@code reason} red ({@code /reject}) için STRICT zorunludur (servis
 * doğrular); approve / cancel için opsiyonel not.</p>
 */
@Data
public class ApprovalDecisionRequest {

    @Size(max = 1000, message = "Gerekçe en fazla 1000 karakter olabilir")
    private String reason;
}
