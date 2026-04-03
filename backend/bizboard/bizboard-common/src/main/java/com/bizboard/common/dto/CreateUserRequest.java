package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
public class CreateUserRequest {

    @NotBlank
    private String username;

    @NotBlank
    @Size(min = 6)
    private String password;

    @NotBlank
    @JsonProperty("full_name")
    private String fullName;

    @NotBlank
    private String role;

    @NotEmpty(message = "En az bir isletme secilmelidir")
    @JsonProperty("business_ids")
    private List<UUID> businessIds;
}
