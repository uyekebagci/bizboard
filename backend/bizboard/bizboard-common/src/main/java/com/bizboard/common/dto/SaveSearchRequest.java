package com.bizboard.common.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.Map;

/**
 * v2.2.0 — kayıtlı arama oluştur/güncelle isteği (spec §9.1).
 */
@Data
public class SaveSearchRequest {

    @NotBlank(message = "İsim zorunlu")
    @Size(max = 120, message = "İsim en fazla 120 karakter")
    private String name;

    @NotBlank(message = "Sorgu zorunlu")
    @Size(max = 512, message = "Sorgu en fazla 512 karakter")
    private String query;

    private Map<String, Object> filters;
}
