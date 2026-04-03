package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class EmployeeSummaryDto {

    @JsonProperty("total_employees")
    private int totalEmployees;

    @JsonProperty("active_employees")
    private int activeEmployees;

    @JsonProperty("total_salary")
    private BigDecimal totalSalary;

    @JsonProperty("total_insurance")
    private BigDecimal totalInsurance;

    @JsonProperty("total_cost")
    private BigDecimal totalCost;
}
