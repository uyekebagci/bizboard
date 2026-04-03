package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class CreateEmployeeRequest {

    @JsonProperty("full_name")
    private String fullName;

    private String position;

    @JsonProperty("tc_no")
    private String tcNo;

    private String phone;

    private BigDecimal salary;

    @JsonProperty("insurance_cost")
    private BigDecimal insuranceCost;

    @JsonProperty("start_date")
    private LocalDate startDate;

    @JsonProperty("end_date")
    private LocalDate endDate;

    private String notes;
}
