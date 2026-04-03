package com.bizboard.api.controller;

import com.bizboard.common.dto.CreateVehicleRequest;
import com.bizboard.common.dto.VehicleDto;
import com.bizboard.common.dto.VehicleSummaryDto;
import com.bizboard.service.VehicleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class VehicleController {

    private final VehicleService vehicleService;

    // ─── İşletmeye ait araçlar ────────────────────────────

    @GetMapping("/businesses/{businessId}/vehicles")
    public ResponseEntity<List<VehicleDto>> getVehicles(
            @PathVariable UUID businessId) {
        return ResponseEntity.ok(vehicleService.getVehiclesForBusiness(businessId));
    }

    @GetMapping("/businesses/{businessId}/vehicles/summary")
    public ResponseEntity<VehicleSummaryDto> getVehicleSummary(
            @PathVariable UUID businessId) {
        return ResponseEntity.ok(vehicleService.getVehicleSummary(businessId));
    }

    @PostMapping("/businesses/{businessId}/vehicles")
    public ResponseEntity<VehicleDto> createVehicle(
            @PathVariable UUID businessId,
            @RequestBody CreateVehicleRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(vehicleService.createVehicle(businessId, request));
    }

    // ─── Tekil araç işlemleri ─────────────────────────────

    @GetMapping("/vehicles/{vehicleId}")
    public ResponseEntity<VehicleDto> getVehicle(
            @PathVariable UUID vehicleId) {
        return ResponseEntity.ok(vehicleService.getVehicle(vehicleId));
    }

    @PutMapping("/vehicles/{vehicleId}")
    public ResponseEntity<VehicleDto> updateVehicle(
            @PathVariable UUID vehicleId,
            @RequestBody CreateVehicleRequest request) {
        return ResponseEntity.ok(vehicleService.updateVehicle(vehicleId, request));
    }

    @PatchMapping("/vehicles/{vehicleId}/toggle-active")
    public ResponseEntity<VehicleDto> toggleActive(
            @PathVariable UUID vehicleId) {
        return ResponseEntity.ok(vehicleService.toggleVehicleActive(vehicleId));
    }

    @DeleteMapping("/vehicles/{vehicleId}")
    public ResponseEntity<Void> deleteVehicle(
            @PathVariable UUID vehicleId) {
        vehicleService.deleteVehicle(vehicleId);
        return ResponseEntity.noContent().build();
    }
}
