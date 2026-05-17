package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class CreateFixedCostRequest {
    private String name;
    private String type;
    private BigDecimal amount;
    private String frequency;
    private String notes;

    /** v1.5.9: recurring engine "her ay otomatik tx üret" tercihi (opsiyonel, default false). */
    @JsonProperty("auto_generate")
    private Boolean autoGenerate;
}
