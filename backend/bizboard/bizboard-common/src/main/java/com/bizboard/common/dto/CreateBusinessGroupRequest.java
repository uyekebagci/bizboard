package com.bizboard.common.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * v1.6.11: POST /api/me/business-groups body.
 *
 * priority opsiyonel — boş ise NORMAL (2). color opsiyonel — boş ise "zinc".
 */
@Data
public class CreateBusinessGroupRequest {

    @NotBlank
    @Size(max = 80)
    private String name;

    /** "zinc", "blue", "green", "orange", "red", "purple", "pink", "teal". */
    @Size(max = 16)
    private String color;

    /** 0=PINNED, 1=HIGH, 2=NORMAL. */
    private Integer priority;
}
