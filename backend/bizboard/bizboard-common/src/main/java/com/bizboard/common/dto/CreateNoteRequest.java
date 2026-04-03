package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateNoteRequest {

    @NotBlank(message = "Not icerigi zorunludur")
    private String content;

    @JsonProperty("is_pinned")
    private Boolean pinned;

    private String color;

    @JsonProperty("admin_only")
    private Boolean adminOnly;
}
