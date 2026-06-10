package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Kategori (gelir/gider) oluşturma isteği. Kategoriler per-business + per-direction
 * (INCOME/EXPENSE) tutulur; gelir ve gider kategorileri ayrı korunur.
 *
 * <p>{@code name} ve {@code direction} zorunlu; {@code icon}/{@code color}/
 * {@code sortOrder} opsiyonel. Aynı business+direction içinde isim tekrarı
 * service tarafında reddedilir (case-insensitive).</p>
 */
@Data
public class CreateCategoryRequest {

    @NotBlank
    private String name;

    /** "INCOME" veya "EXPENSE" (case-insensitive). */
    @NotNull
    private String direction;

    private String icon;

    private String color;

    @JsonProperty("sort_order")
    private Integer sortOrder;
}
