package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class CreateBusinessRequest {

    @NotBlank
    private String name;

    private String description;

    /**
     * v1.6.2.1: işletme tipi adı opsiyonel — wizard'dan Tip Seçimi adımı
     * tamamen kaldırıldı. Verilirse raporlama/filtrelemede kullanılır.
     */
    @JsonProperty("business_type_name")
    private String businessTypeName;

    private String color;

    private String currency;

    @JsonProperty("logo_url")
    private String logoUrl;

    private Map<String, Object> metadata;

    private List<String> modules;

    @JsonProperty("is_mockup")
    private boolean mockup;

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
