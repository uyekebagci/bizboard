package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class EmployeeDto {
    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    @JsonProperty("full_name")
    private String fullName;

    private String position;

    @JsonProperty("tc_no")
    private String tcNo;

    private String phone;

    private BigDecimal salary;

    @JsonProperty("insurance_cost")
    private BigDecimal insuranceCost;

    @JsonProperty("total_cost")
    private BigDecimal totalCost;

    @JsonProperty("start_date")
    private LocalDate startDate;

    @JsonProperty("end_date")
    private LocalDate endDate;

    @JsonProperty("is_active")
    private boolean active;

    private String notes;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
}
