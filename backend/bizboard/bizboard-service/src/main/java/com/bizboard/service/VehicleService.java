package com.bizboard.service;

import com.bizboard.common.dto.CreateVehicleRequest;
import com.bizboard.common.dto.VehicleDto;
import com.bizboard.common.dto.VehicleSummaryDto;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.FixedCost;
import com.bizboard.common.entity.Vehicle;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.FixedCostRepository;
import com.bizboard.repository.VehicleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class VehicleService {

    private final VehicleRepository vehicleRepository;
    private final BusinessRepository businessRepository;
    private final FixedCostRepository fixedCostRepository;
    private final BusinessAccessGuard accessGuard;

    // ─── İşletmeye ait araçları getir ───────────────────────

    @Transactional(readOnly = true)
    public List<VehicleDto> getVehiclesForBusiness(UUID businessId, UUID actorUserId) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        return vehicleRepository.findByBusinessIdOrderByPlateNumberAsc(businessId)
                .stream().map(this::toDto).toList();
    }

    // ─── Araç detayı ───────────────────────────────────────

    @Transactional(readOnly = true)
    public VehicleDto getVehicle(UUID vehicleId, UUID actorUserId) {
        Vehicle vehicle = vehicleRepository.findById(vehicleId)
                .orElseThrow(() -> new IllegalArgumentException("Arac bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId, vehicle.getBusiness().getId());
        return toDto(vehicle);
    }

    // ─── Araç oluştur ──────────────────────────────────────

    @Transactional
    public VehicleDto createVehicle(UUID businessId, CreateVehicleRequest request, UUID actorUserId) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Isletme bulunamadi"));

        Vehicle vehicle = Vehicle.builder()
                .business(business)
                .plateNumber(request.getPlateNumber())
                .brand(request.getBrand())
                .model(request.getModel())
                .modelYear(request.getModelYear())
                .color(request.getColor())
                .chassisNumber(request.getChassisNumber())
                .engineNumber(request.getEngineNumber())
                .fuelType(request.getFuelType())
                .engineDisplacement(request.getEngineDisplacement())
                .horsePower(request.getHorsePower())
                .transmission(request.getTransmission())
                .vehicleType(request.getVehicleType())
                .currentKm(request.getCurrentKm() != null ? request.getCurrentKm() : 0)
                .avgFuelConsumption(request.getAvgFuelConsumption())
                .registrationSerial(request.getRegistrationSerial())
                .registrationNumber(request.getRegistrationNumber())
                .trafficInsuranceExpiry(request.getTrafficInsuranceExpiry())
                .kaskoExpiry(request.getKaskoExpiry())
                .inspectionExpiry(request.getInspectionExpiry())
                .ownershipType(request.getOwnershipType() != null
                        ? request.getOwnershipType().toUpperCase(Locale.ENGLISH) : "OWNED")
                .rentalCost(request.getRentalCost() != null ? request.getRentalCost() : BigDecimal.ZERO)
                .rentalPeriod(request.getRentalPeriod())
                .rentalStartDate(request.getRentalStartDate())
                .rentalEndDate(request.getRentalEndDate())
                .rentalCompany(request.getRentalCompany())
                .notes(request.getNotes())
                .build();

        vehicle = vehicleRepository.save(vehicle);
        log.info("Arac olusturuldu: {} {} {} plaka={} isletme={}",
                vehicle.getBrand(), vehicle.getModel(), vehicle.getModelYear(),
                vehicle.getPlateNumber(), business.getName());

        // Kiralık araç sabit giderini güncelle
        updateVehicleRentalFixedCost(businessId);

        return toDto(vehicle);
    }

    // ─── Araç güncelle ─────────────────────────────────────

    @Transactional
    public VehicleDto updateVehicle(UUID vehicleId, CreateVehicleRequest request, UUID actorUserId) {
        Vehicle v = vehicleRepository.findById(vehicleId)
                .orElseThrow(() -> new IllegalArgumentException("Arac bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId, v.getBusiness().getId());

        if (request.getPlateNumber() != null) v.setPlateNumber(request.getPlateNumber());
        if (request.getBrand() != null) v.setBrand(request.getBrand());
        if (request.getModel() != null) v.setModel(request.getModel());
        if (request.getModelYear() != null) v.setModelYear(request.getModelYear());
        if (request.getColor() != null) v.setColor(request.getColor());
        if (request.getChassisNumber() != null) v.setChassisNumber(request.getChassisNumber());
        if (request.getEngineNumber() != null) v.setEngineNumber(request.getEngineNumber());
        if (request.getFuelType() != null) v.setFuelType(request.getFuelType());
        if (request.getEngineDisplacement() != null) v.setEngineDisplacement(request.getEngineDisplacement());
        if (request.getHorsePower() != null) v.setHorsePower(request.getHorsePower());
        if (request.getTransmission() != null) v.setTransmission(request.getTransmission());
        if (request.getVehicleType() != null) v.setVehicleType(request.getVehicleType());
        if (request.getCurrentKm() != null) v.setCurrentKm(request.getCurrentKm());
        if (request.getAvgFuelConsumption() != null) v.setAvgFuelConsumption(request.getAvgFuelConsumption());
        if (request.getRegistrationSerial() != null) v.setRegistrationSerial(request.getRegistrationSerial());
        if (request.getRegistrationNumber() != null) v.setRegistrationNumber(request.getRegistrationNumber());
        if (request.getTrafficInsuranceExpiry() != null) v.setTrafficInsuranceExpiry(request.getTrafficInsuranceExpiry());
        if (request.getKaskoExpiry() != null) v.setKaskoExpiry(request.getKaskoExpiry());
        if (request.getInspectionExpiry() != null) v.setInspectionExpiry(request.getInspectionExpiry());
        if (request.getOwnershipType() != null) v.setOwnershipType(request.getOwnershipType().toUpperCase(Locale.ENGLISH));
        if (request.getRentalCost() != null) v.setRentalCost(request.getRentalCost());
        if (request.getRentalPeriod() != null) v.setRentalPeriod(request.getRentalPeriod());
        if (request.getRentalStartDate() != null) v.setRentalStartDate(request.getRentalStartDate());
        if (request.getRentalEndDate() != null) v.setRentalEndDate(request.getRentalEndDate());
        if (request.getRentalCompany() != null) v.setRentalCompany(request.getRentalCompany());
        if (request.getNotes() != null) v.setNotes(request.getNotes());

        v = vehicleRepository.save(v);
        log.info("Arac guncellendi: {} {}", v.getPlateNumber(), v.getBrand());

        updateVehicleRentalFixedCost(v.getBusiness().getId());

        return toDto(v);
    }

    // ─── Araç aktif/pasif ──────────────────────────────────

    @Transactional
    public VehicleDto toggleVehicleActive(UUID vehicleId, UUID actorUserId) {
        Vehicle v = vehicleRepository.findById(vehicleId)
                .orElseThrow(() -> new IllegalArgumentException("Arac bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId, v.getBusiness().getId());

        v.setActive(!v.isActive());
        v = vehicleRepository.save(v);
        log.info("Arac {} durumu: {}", v.getPlateNumber(), v.isActive() ? "aktif" : "pasif");

        updateVehicleRentalFixedCost(v.getBusiness().getId());

        return toDto(v);
    }

    // ─── Araç sil ──────────────────────────────────────────

    @Transactional
    public void deleteVehicle(UUID vehicleId, UUID actorUserId) {
        Vehicle v = vehicleRepository.findById(vehicleId)
                .orElseThrow(() -> new IllegalArgumentException("Arac bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId, v.getBusiness().getId());

        UUID businessId = v.getBusiness().getId();
        vehicleRepository.delete(v);
        log.info("Arac silindi: {} {} {}", v.getPlateNumber(), v.getBrand(), v.getModel());

        updateVehicleRentalFixedCost(businessId);
    }

    // ─── Araç özeti ────────────────────────────────────────

    @Transactional(readOnly = true)
    public VehicleSummaryDto getVehicleSummary(UUID businessId, UUID actorUserId) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        List<Vehicle> vehicles = vehicleRepository.findByBusinessIdOrderByPlateNumberAsc(businessId);

        int total = vehicles.size();
        int active = (int) vehicles.stream().filter(Vehicle::isActive).count();
        int owned = (int) vehicles.stream().filter(v -> v.isActive() && "OWNED".equalsIgnoreCase(v.getOwnershipType())).count();
        int rented = (int) vehicles.stream().filter(v -> v.isActive() && "RENTED".equalsIgnoreCase(v.getOwnershipType())).count();
        int leased = (int) vehicles.stream().filter(v -> v.isActive() && "LEASED".equalsIgnoreCase(v.getOwnershipType())).count();

        BigDecimal totalMonthlyRentalCost = vehicles.stream()
                .filter(v -> v.isActive() && !"OWNED".equalsIgnoreCase(v.getOwnershipType()))
                .map(this::calculateMonthlyRentalCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return VehicleSummaryDto.builder()
                .totalVehicles(total)
                .activeVehicles(active)
                .ownedCount(owned)
                .rentedCount(rented)
                .leasedCount(leased)
                .totalMonthlyRentalCost(totalMonthlyRentalCost)
                .build();
    }

    // ─── Kiralık araç sabit giderini otomatik güncelle ─────

    private void updateVehicleRentalFixedCost(UUID businessId) {
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Isletme bulunamadi"));

        List<Vehicle> activeRentedVehicles = vehicleRepository
                .findByBusinessIdAndActiveTrueOrderByPlateNumberAsc(businessId)
                .stream()
                .filter(v -> !"OWNED".equalsIgnoreCase(v.getOwnershipType()))
                .toList();

        BigDecimal totalMonthly = activeRentedVehicles.stream()
                .map(this::calculateMonthlyRentalCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Mevcut VEHICLE_RENTAL tipi sabit gideri bul veya oluştur
        List<FixedCost> vehicleCosts = fixedCostRepository
                .findByBusinessIdAndTypeOrderByCreatedAtDesc(businessId, "VEHICLE_RENTAL");

        if (vehicleCosts.isEmpty()) {
            if (totalMonthly.compareTo(BigDecimal.ZERO) > 0) {
                FixedCost fc = FixedCost.builder()
                        .business(business)
                        .name("Arac Kiralama Gideri")
                        .type("VEHICLE_RENTAL")
                        .amount(totalMonthly)
                        .frequency("MONTHLY")
                        .auto(true)
                        .build();
                fixedCostRepository.save(fc);
                log.info("Arac kiralama sabit gideri olusturuldu: {} TL/ay - isletme={}",
                        totalMonthly, business.getName());
            }
        } else {
            FixedCost fc = vehicleCosts.get(0);
            fc.setAmount(totalMonthly);
            fixedCostRepository.save(fc);
            log.info("Arac kiralama sabit gideri guncellendi: {} TL/ay - isletme={}",
                    totalMonthly, business.getName());
        }
    }

    // ─── Aylık kiralama maliyeti hesapla ───────────────────

    private BigDecimal calculateMonthlyRentalCost(Vehicle v) {
        if (v.getRentalCost() == null || v.getRentalCost().compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }

        String period = v.getRentalPeriod() != null
                ? v.getRentalPeriod().toUpperCase(Locale.ENGLISH) : "MONTHLY";

        return switch (period) {
            case "DAILY" -> v.getRentalCost().multiply(BigDecimal.valueOf(30));
            case "WEEKLY" -> v.getRentalCost().multiply(BigDecimal.valueOf(4.33))
                    .setScale(2, RoundingMode.HALF_UP);
            case "MONTHLY" -> v.getRentalCost();
            case "YEARLY" -> v.getRentalCost().divide(BigDecimal.valueOf(12), 2, RoundingMode.HALF_UP);
            default -> v.getRentalCost();
        };
    }

    // ─── DTO Mapper ────────────────────────────────────────

    private VehicleDto toDto(Vehicle v) {
        return VehicleDto.builder()
                .id(v.getId())
                .businessId(v.getBusiness().getId())
                .businessName(v.getBusiness().getName())
                .plateNumber(v.getPlateNumber())
                .brand(v.getBrand())
                .model(v.getModel())
                .modelYear(v.getModelYear())
                .color(v.getColor())
                .chassisNumber(v.getChassisNumber())
                .engineNumber(v.getEngineNumber())
                .fuelType(v.getFuelType())
                .engineDisplacement(v.getEngineDisplacement())
                .horsePower(v.getHorsePower())
                .transmission(v.getTransmission())
                .vehicleType(v.getVehicleType())
                .currentKm(v.getCurrentKm())
                .avgFuelConsumption(v.getAvgFuelConsumption())
                .registrationSerial(v.getRegistrationSerial())
                .registrationNumber(v.getRegistrationNumber())
                .trafficInsuranceExpiry(v.getTrafficInsuranceExpiry())
                .kaskoExpiry(v.getKaskoExpiry())
                .inspectionExpiry(v.getInspectionExpiry())
                .ownershipType(v.getOwnershipType())
                .rentalCost(v.getRentalCost())
                .rentalPeriod(v.getRentalPeriod())
                .rentalStartDate(v.getRentalStartDate())
                .rentalEndDate(v.getRentalEndDate())
                .rentalCompany(v.getRentalCompany())
                .monthlyRentalCost(calculateMonthlyRentalCost(v))
                .active(v.isActive())
                .notes(v.getNotes())
                .createdAt(v.getCreatedAt())
                .updatedAt(v.getUpdatedAt())
                .build();
    }
}
