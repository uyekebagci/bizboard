package com.bizboard.common.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * v1.6.11: PATCH /api/me/business-groups/{id} body.
 *
 * Tüm alanlar opsiyonel — yalnız verilenler güncellenir (partial update).
 */
@Data
public class UpdateBusinessGroupRequest {

    @Size(max = 80)
    private String name;

    @Size(max = 16)
    private String color;

    /** 0=PINNED, 1=HIGH, 2=NORMAL. */
    private Integer priority;
}
