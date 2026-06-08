package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * WP a9da4e9d: Bireysel borç düzenleme isteği. Partial update —
 * yalnız non-null gelen alanlar güncellenir, gönderilmeyen alanlar
 * mevcut değerini korur.
 */
@Data
public class UpdateDebtRequest {

    /**
     * Yeni tutar (magnitude — her zaman pozitif saklanır, sign frontend'de).
     * Null gelirse tutar değiştirilmez.
     */
    @Positive
    private BigDecimal amount;

    /** Yeni vade tarihi. Null gelirse vade değiştirilmez. */
    @JsonProperty("due_date")
    private LocalDate dueDate;

    /**
     * WP a9da4e9d: "Henüz belli değil" — vade'yi açıkça NULL'a çek (bilinmiyor).
     * Partial update null'ı atladığı için vade'yi temizlemenin tek yolu budur.
     * true ise {@link #dueDate} yok sayılır ve vade null yapılır.
     */
    @JsonProperty("clear_due_date")
    private Boolean clearDueDate;

    /** Yeni açıklama. Null gelirse açıklama değiştirilmez. */
    private String description;
}
