package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
public class CreateBusinessRequest {

    @NotBlank
    private String name;

    private String description;

    /**
     * v1.6.1: opsiyonel — manuel wizard akışı tip kartlarını kaldırdı.
     * Eğer null gelirse {@code business_type_name} kullanılarak BusinessType
     * find-or-create edilir.
     */
    @JsonProperty("business_type_id")
    private UUID businessTypeId;

    private String color;

    private String currency;

    @JsonProperty("logo_url")
    private String logoUrl;

    private Map<String, Object> metadata;

    private List<String> modules;

    @JsonProperty("is_mockup")
    private boolean mockup;

    /**
     * v1.5.6: işletme tipinin {@code business_type_default_costs} kayıtlarından
     * otomatik kurulum + sabit gider üretmek istenirse {@code true}.
     * - setup=true kalemler → tek seferlik Transaction (gider yönü, is_setup_cost=true)
     * - setup=false kalemler → FixedCost (recurring)
     * Default false (geriye uyumluluk).
     */
    @JsonProperty("include_setup_costs")
    private boolean includeSetupCosts;

    /**
     * v1.5.7: yeni wizard'ın serbest metin işletme tipi adı (autocomplete'lik).
     * BusinessType FK'sine ek; raporlamada ve sonraki autocomplete'lerde kullanılır.
     * Yeni wizard akışı bunu zorunlu girer.
     */
    @JsonProperty("business_type_name")
    private String businessTypeName;

    /**
     * v1.5.7: Wizard adım 1 — kuruluş maliyetleri (manuel serbest liste).
     * Her kalem ayrı bir Transaction olarak oluşur ({@code is_setup_cost=true},
     * direction=EXPENSE). Atomic akış — biri patlarsa business dahil hepsi rollback.
     */
    @JsonProperty("setup_costs")
    private java.util.List<WizardSetupCostItem> setupCosts;

    /**
     * v1.5.7: Wizard adım 2 — aylık sabit masraflar.
     * Her geçerli (applicable=true) kalem ayrı bir FixedCost olarak oluşur
     * (frequency=MONTHLY, auto=false). 11 zorunlu kategori + Diğer.
     */
    @JsonProperty("monthly_fixed_costs")
    private java.util.List<WizardMonthlyFixedCostItem> monthlyFixedCosts;
}
