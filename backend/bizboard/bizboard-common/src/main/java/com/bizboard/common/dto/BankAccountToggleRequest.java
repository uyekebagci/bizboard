package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * v1.6.22 (WP-5): PATCH /bank-accounts/{id}/active body.
 *
 * <p>force=true geçilirse bakiye 0 değil bile pasif yapılır (uyarı atlanır).
 * Default false — bakiye 0 değilse 409 dönülür.</p>
 */
@Data
public class BankAccountToggleRequest {

    @NotNull
    @JsonProperty("is_active")
    private Boolean isActive;

    /** Pasif yaparken bakiye sıfır değilse zorla devam et. */
    private Boolean force;
}
