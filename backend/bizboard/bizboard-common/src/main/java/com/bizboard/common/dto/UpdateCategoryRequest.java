package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/**
 * Kategori güncelleme isteği. Tüm alanlar opsiyonel (verilen alanlar güncellenir).
 *
 * <p>{@code direction} kasıtlı OLARAK güncellenmez — yön değiştirmek bağlı
 * transaction'ların direction-tutarlılığını bozar; yeni yön için yeni kategori
 * oluşturulmalı.</p>
 */
@Data
public class UpdateCategoryRequest {

    private String name;

    private String icon;

    private String color;

    @JsonProperty("sort_order")
    private Integer sortOrder;
}
