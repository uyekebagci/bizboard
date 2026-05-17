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

    @NotNull
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
}
