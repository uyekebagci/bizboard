package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.Map;

/**
 * WP e4dc5271: PATCH /quick-actions/{id} body — partial update.
 *
 * <p>Yalnız sağlanan alanlar güncellenir. business_id immutable (kayıt
 * başlangıçta hangi business'sa orada kalır).</p>
 */
@Data
public class UpdateQuickActionRequest {

    @Size(max = 100)
    private String name;

    @JsonProperty("tx_template")
    private Map<String, Object> txTemplate;

    private String icon;
    private String color;

    @JsonProperty("order_index")
    private Integer orderIndex;
}
