package com.bizboard.api.controller;

import com.bizboard.common.dto.CreateVehicleRequest;
import com.bizboard.common.dto.VehicleDto;
import com.bizboard.common.dto.VehicleSummaryDto;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.VehicleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
            @PathVariable UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(vehicleService.getVehiclesForBusiness(businessId, principal.getId()));
    }

    @GetMapping("/businesses/{businessId}/vehicles/summary")
    public ResponseEntity<VehicleSummaryDto> getVehicleSummary(
            @PathVariable UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(vehicleService.getVehicleSummary(businessId, principal.getId()));
    }

    @PostMapping("/businesses/{businessId}/vehicles")
    public ResponseEntity<VehicleDto> createVehicle(
            @PathVariable UUID businessId,
            @RequestBody CreateVehicleRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(vehicleService.createVehicle(businessId, request, principal.getId()));
    }

    // ─── Tekil araç işlemleri ─────────────────────────────

    @GetMapping("/vehicles/{vehicleId}")
    public ResponseEntity<VehicleDto> getVehicle(
            @PathVariable UUID vehicleId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(vehicleService.getVehicle(vehicleId, principal.getId()));
    }

    @PutMapping("/vehicles/{vehicleId}")
    public ResponseEntity<VehicleDto> updateVehicle(
            @PathVariable UUID vehicleId,
            @RequestBody CreateVehicleRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(vehicleService.updateVehicle(vehicleId, request, principal.getId()));
    }

    @PatchMapping("/vehicles/{vehicleId}/toggle-active")
    public ResponseEntity<VehicleDto> toggleActive(
            @PathVariable UUID vehicleId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(vehicleService.toggleVehicleActive(vehicleId, principal.getId()));
    }

    @DeleteMapping("/vehicles/{vehicleId}")
    public ResponseEntity<Void> deleteVehicle(
            @PathVariable UUID vehicleId,
            @AuthenticationPrincipal UserPrincipal principal) {
        vehicleService.deleteVehicle(vehicleId, principal.getId());
        return ResponseEntity.noContent().build();
    }
}
