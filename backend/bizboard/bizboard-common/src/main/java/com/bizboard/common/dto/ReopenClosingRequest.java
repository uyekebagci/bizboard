package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * v1.6.19 (WP-2): POST /api/closings/{id}/reopen body.
 *
 * <p>Reopen audit log'da iz bırakır — sebep zorunlu (boş string kabul edilmez).</p>
 */
@Data
public class ReopenClosingRequest {

    @NotBlank
    @JsonProperty("reason_note")
    private String reasonNote;
}
