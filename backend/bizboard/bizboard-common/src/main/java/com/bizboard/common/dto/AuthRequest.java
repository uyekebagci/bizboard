package com.bizboard.common.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AuthRequest {

    @NotBlank
    private String username;

    @NotBlank
    @Size(min = 6)
    private String password;
}
