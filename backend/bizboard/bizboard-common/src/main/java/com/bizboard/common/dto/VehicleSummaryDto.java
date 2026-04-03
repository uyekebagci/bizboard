package com.bizboard.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class VehicleSummaryDto {

    @JsonProperty("total_vehicles")
    private int totalVehicles;

    @JsonProperty("active_vehicles")
    private int activeVehicles;

    @JsonProperty("owned_count")
    private int ownedCount;

    @JsonProperty("rented_count")
    private int rentedCount;

    @JsonProperty("leased_count")
    private int leasedCount;

    @JsonProperty("total_monthly_rental_cost")
    private BigDecimal totalMonthlyRentalCost;
}
