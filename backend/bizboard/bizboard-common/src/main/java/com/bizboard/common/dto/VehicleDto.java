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
public class VehicleDto {
    private UUID id;

    @JsonProperty("business_id")
    private UUID businessId;

    @JsonProperty("business_name")
    private String businessName;

    // Temel
    @JsonProperty("plate_number")
    private String plateNumber;

    private String brand;
    private String model;

    @JsonProperty("model_year")
    private Integer modelYear;

    private String color;

    // Teknik
    @JsonProperty("chassis_number")
    private String chassisNumber;

    @JsonProperty("engine_number")
    private String engineNumber;

    @JsonProperty("fuel_type")
    private String fuelType;

    @JsonProperty("engine_displacement")
    private Integer engineDisplacement;

    @JsonProperty("horse_power")
    private Integer horsePower;

    private String transmission;

    @JsonProperty("vehicle_type")
    private String vehicleType;

    // Kilometre & Yakıt
    @JsonProperty("current_km")
    private Integer currentKm;

    @JsonProperty("avg_fuel_consumption")
    private BigDecimal avgFuelConsumption;

    // Ruhsat & Sigorta
    @JsonProperty("registration_serial")
    private String registrationSerial;

    @JsonProperty("registration_number")
    private String registrationNumber;

    @JsonProperty("traffic_insurance_expiry")
    private LocalDate trafficInsuranceExpiry;

    @JsonProperty("kasko_expiry")
    private LocalDate kaskoExpiry;

    @JsonProperty("inspection_expiry")
    private LocalDate inspectionExpiry;

    // Sahiplik & Kiralama
    @JsonProperty("ownership_type")
    private String ownershipType;

    @JsonProperty("rental_cost")
    private BigDecimal rentalCost;

    @JsonProperty("rental_period")
    private String rentalPeriod;

    @JsonProperty("rental_start_date")
    private LocalDate rentalStartDate;

    @JsonProperty("rental_end_date")
    private LocalDate rentalEndDate;

    @JsonProperty("rental_company")
    private String rentalCompany;

    @JsonProperty("monthly_rental_cost")
    private BigDecimal monthlyRentalCost;

    // Durum
    @JsonProperty("is_active")
    private boolean active;

    private String notes;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
}
