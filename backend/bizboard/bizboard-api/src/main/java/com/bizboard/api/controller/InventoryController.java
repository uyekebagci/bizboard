package com.bizboard.api.controller;

import com.bizboard.common.dto.*;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.InventoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class InventoryController {

    private final InventoryService inventoryService;

    // ── İşletme bazlı envanter ──

    @GetMapping("/businesses/{businessId}/inventory")
    public ResponseEntity<List<InventoryItemDto>> getItems(
            @PathVariable UUID businessId,
            @RequestParam(required = false) String category) {
        if (category != null && !category.isBlank()) {
            return ResponseEntity.ok(inventoryService.getItemsByCategory(businessId, category));
        }
        return ResponseEntity.ok(inventoryService.getItems(businessId));
    }

    @GetMapping("/businesses/{businessId}/inventory/summary")
    public ResponseEntity<InventorySummaryDto> getSummary(@PathVariable UUID businessId) {
        return ResponseEntity.ok(inventoryService.getSummary(businessId));
    }

    @PostMapping("/businesses/{businessId}/inventory")
    public ResponseEntity<InventoryItemDto> createItem(
            @PathVariable UUID businessId,
            @Valid @RequestBody CreateInventoryItemRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(inventoryService.createItem(businessId, request));
    }

    // ── Tekil envanter kalemi ──

    @GetMapping("/inventory/{itemId}")
    public ResponseEntity<InventoryItemDto> getItem(@PathVariable UUID itemId) {
        return ResponseEntity.ok(inventoryService.getItem(itemId));
    }

    @PutMapping("/inventory/{itemId}")
    public ResponseEntity<InventoryItemDto> updateItem(
            @PathVariable UUID itemId,
            @RequestBody CreateInventoryItemRequest request) {
        return ResponseEntity.ok(inventoryService.updateItem(itemId, request));
    }

    @DeleteMapping("/inventory/{itemId}")
    public ResponseEntity<Void> deleteItem(@PathVariable UUID itemId) {
        inventoryService.deleteItem(itemId);
        return ResponseEntity.noContent().build();
    }

    // ── Bakım kayıtları ──

    @GetMapping("/inventory/{itemId}/maintenance")
    public ResponseEntity<List<MaintenanceLogDto>> getMaintenanceLogs(@PathVariable UUID itemId) {
        return ResponseEntity.ok(inventoryService.getMaintenanceLogs(itemId));
    }

    @PostMapping("/inventory/{itemId}/maintenance")
    public ResponseEntity<MaintenanceLogDto> addMaintenanceLog(
            @PathVariable UUID itemId,
            @Valid @RequestBody CreateMaintenanceLogRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(inventoryService.addMaintenanceLog(itemId, request));
    }

    // ── Yakıt kayıtları ──

    @GetMapping("/inventory/{itemId}/fuel-logs")
    public ResponseEntity<List<FuelLogDto>> getFuelLogs(@PathVariable UUID itemId) {
        return ResponseEntity.ok(inventoryService.getFuelLogs(itemId));
    }

    @PostMapping("/inventory/{itemId}/fuel-logs")
    public ResponseEntity<FuelLogDto> addFuelLog(
            @PathVariable UUID itemId,
            @Valid @RequestBody CreateFuelLogRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(inventoryService.addFuelLog(itemId, request));
    }

    // ── Tüm işletmelerin envanteri (portfolio) ──

    @GetMapping("/portfolio/inventory")
    public ResponseEntity<List<InventoryItemDto>> getAllInventory(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) UUID business_id,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(inventoryService.getAllInventoryForUser(
                principal.getId(), category, business_id));
    }
}
