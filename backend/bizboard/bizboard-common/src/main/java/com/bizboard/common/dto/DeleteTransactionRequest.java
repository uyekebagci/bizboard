package com.bizboard.common.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class DeleteTransactionRequest {

    @NotBlank(message = "Silme sebebi zorunludur")
    private String reason;
}
