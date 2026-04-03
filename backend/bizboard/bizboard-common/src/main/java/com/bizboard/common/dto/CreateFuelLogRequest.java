package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class CreateFuelLogRequest {

    @NotBlank
    @JsonProperty("fuel_type")
    private String fuelType;

    @NotNull
    private BigDecimal amount;

    @NotNull
    private BigDecimal cost;

    @NotNull
    private LocalDate date;

    @JsonProperty("odometer_km")
    private BigDecimal odometerKm;

    private String station;

    @JsonProperty("receipt_url")
    private String receiptUrl;

    private String notes;
}
