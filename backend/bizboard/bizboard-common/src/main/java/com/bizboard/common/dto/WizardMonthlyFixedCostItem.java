package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;

import java.math.BigDecimal;

/**
 * Wizard adım 2: bir aylık sabit masraf kalemi.
 *
 * <p>{@code applicable=false} → "Geçerli değil" toggle açık. Kategori bu işletmeye
 * uygulanmıyor; backend kayıt yaratmaz (atomic akışta atlanır). Bu durumda
 * {@code amount} 0 olmalı/yoksayılır.</p>
 *
 * <p>Wizard tarafında 11 zorunlu kategori (RENT...TAX) tüm işletmeler için
 * gösterilir; kullanıcı uygulamayanı toggle ile devre dışı bırakır. OTHER ise
 * serbest girişi temsil eder ve istenirse boş bırakılabilir.</p>
 */
@Data
public class WizardMonthlyFixedCostItem {

    /** {@link com.bizboard.common.enums.FixedCostCategory} adı (case-insensitive). */
    @NotBlank
    private String category;

    /**
     * OTHER kategorisi için custom ad; standart kategoriler için kullanılmazsa
     * backend kategorinin label'ını kullanır.
     */
    private String name;

    @PositiveOrZero
    private BigDecimal amount;

    /**
     * Bu kategori işletmeye uygulanıyor mu? false → wizard'da "Geçerli değil"
     * işaretli → atomic create'te atlanır. Default true.
     */
    @JsonProperty("applicable")
    private Boolean applicable;

    public boolean isApplicable() {
        return applicable == null || applicable;
    }
}
