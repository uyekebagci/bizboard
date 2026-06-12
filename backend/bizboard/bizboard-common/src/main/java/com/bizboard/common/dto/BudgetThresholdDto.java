package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Raporlar v1.1 (R7): kategori/dönem bütçe-eşik konfigürasyonu + güncel kullanım.
 *
 * <p><b>DEFAULT KAPALI</b> — bütçesi set edilmemiş kategori listede {@code budget=null}
 * ile döner (UI on/off + input bunu kullanır). Bütçe set edilmiş kategori için
 * {@code spent} (mevcut dönem gerçekleşen gider) + {@code usagePct} hesaplanır.</p>
 *
 * <p>Tüm tutarlar TL ve magnitude pozitif (conventions §2).</p>
 */
@Data
@Builder
public class BudgetThresholdDto {

    @JsonProperty("business_id")
    private UUID businessId;

    /** Bütçe dönemi etiketi (ör. "MONTHLY" — şu an yalnız aylık desteklenir). */
    private String period;

    /** Değerlendirme referans dönem etiketi (ör. "2026-06"). */
    @JsonProperty("period_label")
    private String periodLabel;

    /** Kategori bazlı bütçe satırları. */
    private List<BudgetRow> rows;

    @Data
    @Builder
    public static class BudgetRow {
        @JsonProperty("category_id")
        private UUID categoryId;

        @JsonProperty("category_name")
        private String categoryName;

        private String icon;
        private String color;

        /** Tanımlı bütçe (TL); null = bu kategori için bütçe KAPALI. */
        private BigDecimal budget;

        /** Mevcut dönemde bu kategoride gerçekleşen gider (TL, magnitude). */
        private BigDecimal spent;

        /** Kullanım yüzdesi = spent / budget * 100 (bütçe yoksa null). */
        @JsonProperty("usage_pct")
        private BigDecimal usagePct;

        /** Bütçe aşıldı mı (spent > budget); bütçe yoksa false. */
        private boolean exceeded;
    }
}
