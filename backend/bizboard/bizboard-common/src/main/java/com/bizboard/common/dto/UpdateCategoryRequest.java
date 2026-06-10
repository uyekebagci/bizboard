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

    /**
     * Ledger v2 (Faz A, §3.9): hibrit uygulanabilirlik güncellemesi —
     * {@code BOTH} / {@code INCOME_ONLY} / {@code EXPENSE_ONLY}. Verilmezse
     * mevcut değer korunur. Tek-tarafa-kilit kullanıcı kararıdır (STRICT).
     */
    private String applicability;

    private String icon;

    private String color;

    @JsonProperty("sort_order")
    private Integer sortOrder;
}
