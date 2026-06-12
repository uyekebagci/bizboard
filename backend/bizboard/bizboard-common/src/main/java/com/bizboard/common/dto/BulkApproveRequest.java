package com.bizboard.common.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/**
 * Onay (Approval) modülü v1.1: {@code POST /approvals/bulk-approve} gövdesi —
 * birden çok bekleyen onayı tek seferde onaylama.
 *
 * <p>Her id ayrı ayrı tenant + durum kontrolünden geçer; sonuç başına
 * onaylanan/atlanan döner (kısmi başarı desteklenir).</p>
 */
@Data
public class BulkApproveRequest {

    @NotEmpty(message = "ids boş olamaz")
    private List<UUID> ids;

    @Size(max = 1000, message = "Gerekçe en fazla 1000 karakter olabilir")
    private String reason;
}
