package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateMyCompanyGroupRequest {
    @NotBlank
    private String name;
    private String color;
    private String icon;
    @JsonProperty("order_index")
    private Integer orderIndex;
}
