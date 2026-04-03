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
}
