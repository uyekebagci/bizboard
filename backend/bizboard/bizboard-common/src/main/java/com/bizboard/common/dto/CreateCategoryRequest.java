package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Kategori oluşturma isteği. Paylaşımlı (yön-bağımsız) model: bir kategori hem
 * gelir hem gider işlemlerinde kullanılabilir; kategoriler per-business tutulur.
 *
 * <p>{@code name} zorunlu; {@code direction}/{@code icon}/{@code color}/
 * {@code sortOrder} opsiyonel. {@code direction} geriye dönük uyumluluk için
 * kabul edilir ama YOK SAYILIR (kategori paylaşımlı oluşturulur). Aynı business
 * içinde isim tekrarı service tarafında reddedilir (case-insensitive).</p>
 */
@Data
public class CreateCategoryRequest {

    @NotBlank
    private String name;

    /**
     * Geriye dönük uyumluluk: eski client'lar "INCOME"/"EXPENSE" gönderebilir;
     * paylaşımlı modelde yok sayılır.
     */
    private String direction;

    private String icon;

    private String color;

    @JsonProperty("sort_order")
    private Integer sortOrder;
}
