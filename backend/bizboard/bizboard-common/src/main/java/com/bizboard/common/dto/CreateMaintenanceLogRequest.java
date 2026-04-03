package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class CreateMaintenanceLogRequest {

    @NotBlank
    @JsonProperty("maintenance_type")
    private String maintenanceType;

    private String description;

    private BigDecimal cost;

    @NotNull
    private LocalDate date;

    @JsonProperty("performed_by")
    private String performedBy;

    private String notes;
}
