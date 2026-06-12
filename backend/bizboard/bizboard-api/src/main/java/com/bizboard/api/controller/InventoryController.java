package com.bizboard.api.controller;

import com.bizboard.common.dto.*;
import com.bizboard.security.UserPrincipal;
import com.bizboard.service.InventoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
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
            @RequestParam(required = false) String category,
            @AuthenticationPrincipal UserPrincipal principal) {
        if (category != null && !category.isBlank()) {
            return ResponseEntity.ok(inventoryService.getItemsByCategory(businessId, category, principal.getId()));
        }
        return ResponseEntity.ok(inventoryService.getItems(businessId, principal.getId()));
    }

    @GetMapping("/businesses/{businessId}/inventory/summary")
    public ResponseEntity<InventorySummaryDto> getSummary(
            @PathVariable UUID businessId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(inventoryService.getSummary(businessId, principal.getId()));
    }

    @PostMapping("/businesses/{businessId}/inventory")
    public ResponseEntity<InventoryItemDto> createItem(
            @PathVariable UUID businessId,
            @Valid @RequestBody CreateInventoryItemRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(inventoryService.createItem(businessId, request, principal.getId()));
    }

    // ── Tekil envanter kalemi ──

    @GetMapping("/inventory/{itemId}")
    public ResponseEntity<InventoryItemDto> getItem(
            @PathVariable UUID itemId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(inventoryService.getItem(itemId, principal.getId()));
    }

    @PutMapping("/inventory/{itemId}")
    public ResponseEntity<InventoryItemDto> updateItem(
            @PathVariable UUID itemId,
            @RequestBody CreateInventoryItemRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(inventoryService.updateItem(itemId, request, principal.getId()));
    }

    @DeleteMapping("/inventory/{itemId}")
    public ResponseEntity<Void> deleteItem(
            @PathVariable UUID itemId,
            @AuthenticationPrincipal UserPrincipal principal) {
        inventoryService.deleteItem(itemId, principal.getId());
        return ResponseEntity.noContent().build();
    }

    // ── Bakım kayıtları ──

    @GetMapping("/inventory/{itemId}/maintenance")
    public ResponseEntity<List<MaintenanceLogDto>> getMaintenanceLogs(
            @PathVariable UUID itemId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(inventoryService.getMaintenanceLogs(itemId, principal.getId()));
    }

    @PostMapping("/inventory/{itemId}/maintenance")
    public ResponseEntity<MaintenanceLogDto> addMaintenanceLog(
            @PathVariable UUID itemId,
            @Valid @RequestBody CreateMaintenanceLogRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(inventoryService.addMaintenanceLog(itemId, request, principal.getId()));
    }

    // ── Yakıt kayıtları ──

    @GetMapping("/inventory/{itemId}/fuel-logs")
    public ResponseEntity<List<FuelLogDto>> getFuelLogs(
            @PathVariable UUID itemId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(inventoryService.getFuelLogs(itemId, principal.getId()));
    }

    @PostMapping("/inventory/{itemId}/fuel-logs")
    public ResponseEntity<FuelLogDto> addFuelLog(
            @PathVariable UUID itemId,
            @Valid @RequestBody CreateFuelLogRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(inventoryService.addFuelLog(itemId, request, principal.getId()));
    }

    // ── Tüm işletmelerin envanteri (portfolio) ──

    /**
     * Portfolio envanteri — opsiyonel {@code category}/{@code business_id} filtreli.
     *
     * <p>PERF (server-pagination, non-breaking): {@code page} parametresi GELMEZSE
     * eski davranış AYNEN korunur — {@code List<InventoryItemDto>} JSON dizisi döner
     * (mevcut FE kırılmaz). {@code page} GELİRSE {@link PagedResponseDto} zarfı döner;
     * kategori filtresi DB'de uygulanır, sıralama {@code createdAt DESC}. {@code size}
     * clamp: 1..200, default 50.</p>
     */
    @GetMapping("/portfolio/inventory")
    public ResponseEntity<?> getAllInventory(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) UUID business_id,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size,
            @AuthenticationPrincipal UserPrincipal principal) {

        if (page == null) {
            return ResponseEntity.ok(inventoryService.getAllInventoryForUser(
                    principal.getId(), category, business_id));
        }

        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size == null ? 50 : size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize);
        return ResponseEntity.ok(PagedResponseDto.of(inventoryService.getAllInventoryForUserPaged(
                principal.getId(), category, business_id, pageable)));
    }
}
