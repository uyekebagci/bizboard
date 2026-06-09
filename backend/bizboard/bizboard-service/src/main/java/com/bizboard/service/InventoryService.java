package com.bizboard.service;

import com.bizboard.common.dto.*;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.FuelLog;
import com.bizboard.common.entity.InventoryItem;
import com.bizboard.common.entity.MaintenanceLog;
import com.bizboard.common.entity.User;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.FuelLogRepository;
import com.bizboard.repository.InventoryItemRepository;
import com.bizboard.repository.MaintenanceLogRepository;
import com.bizboard.repository.UserRepository;
import com.bizboard.service.inventory.ReorderCalculator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InventoryService {

    private final InventoryItemRepository inventoryItemRepository;
    private final MaintenanceLogRepository maintenanceLogRepository;
    private final FuelLogRepository fuelLogRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;
    private final ReorderCalculator reorderCalculator;

    // ── Envanter Kalemleri ──

    @Transactional(readOnly = true)
    public List<InventoryItemDto> getItems(UUID businessId, UUID actorUserId) {
        accessGuard.assertCanReadBusiness(actorUserId, businessId);
        return inventoryItemRepository.findByBusinessIdAndActiveTrueOrderByCreatedAtDesc(businessId)
                .stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<InventoryItemDto> getItemsByCategory(UUID businessId, String category, UUID actorUserId) {
        accessGuard.assertCanReadBusiness(actorUserId, businessId);
        return inventoryItemRepository
                .findByBusinessIdAndCategoryAndActiveTrueOrderByCreatedAtDesc(businessId, category.toUpperCase(java.util.Locale.ENGLISH))
                .stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<InventoryItemDto> getAllItemsForBusinesses(List<UUID> businessIds) {
        return inventoryItemRepository.findByBusinessIdInAndActiveTrueOrderByCreatedAtDesc(businessIds)
                .stream().map(item -> {
                    InventoryItemDto dto = toDto(item);
                    dto.setBusinessName(item.getBusiness().getName());
                    return dto;
                }).toList();
    }

    @Transactional(readOnly = true)
    public InventoryItemDto getItem(UUID itemId, UUID actorUserId) {
        InventoryItem item = inventoryItemRepository.findById(itemId)
                .orElseThrow(() -> new IllegalArgumentException("Inventory item not found"));
        accessGuard.assertCanReadBusiness(actorUserId, item.getBusiness().getId());
        return toDto(item);
    }

    @Transactional
    public InventoryItemDto createItem(UUID businessId, CreateInventoryItemRequest request, UUID actorUserId) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        InventoryItem item = InventoryItem.builder()
                .business(business)
                .name(request.getName())
                .category(request.getCategory().toUpperCase(java.util.Locale.ENGLISH))
                .status(request.getStatus() != null ? request.getStatus().toUpperCase(java.util.Locale.ENGLISH) : "ACTIVE")
                .serialNumber(request.getSerialNumber())
                .companyBarcode(request.getCompanyBarcode())
                .brand(request.getBrand())
                .model(request.getModel())
                .powerCapacity(request.getPowerCapacity())
                .energySource(request.getEnergySource())
                .dimensions(request.getDimensions())
                .materialType(request.getMaterialType())
                .moduleCount(request.getModuleCount())
                .interiorDetails(request.getInteriorDetails())
                .sku(request.getSku())
                .unit(request.getUnit())
                .minimumStock(request.getMinimumStock())
                .currentStock(request.getCurrentStock())
                .reorderPoint(request.getReorderPoint())
                .reorderLeadDays(request.getReorderLeadDays() != null ? request.getReorderLeadDays() : 7)
                .warehouseLocation(request.getWarehouseLocation())
                .batchNumber(request.getBatchNumber())
                .expiryDate(request.getExpiryDate())
                .stockCategory(request.getStockCategory())
                .assignedTo(request.getAssignedTo())
                .assignedType(request.getAssignedType())
                .location(request.getLocation())
                .warrantyExpiry(request.getWarrantyExpiry())
                .lastMaintenanceDate(request.getLastMaintenanceDate())
                .purchasePrice(request.getPurchasePrice())
                .purchaseDate(request.getPurchaseDate())
                .notes(request.getNotes())
                .build();

        return toDto(inventoryItemRepository.save(item));
    }

    @Transactional
    public InventoryItemDto updateItem(UUID itemId, CreateInventoryItemRequest request, UUID actorUserId) {
        InventoryItem item = inventoryItemRepository.findById(itemId)
                .orElseThrow(() -> new IllegalArgumentException("Inventory item not found"));
        accessGuard.assertCanAccessBusiness(actorUserId, item.getBusiness().getId());

        if (request.getName() != null) item.setName(request.getName());
        if (request.getCategory() != null) item.setCategory(request.getCategory().toUpperCase(java.util.Locale.ENGLISH));
        if (request.getStatus() != null) item.setStatus(request.getStatus().toUpperCase(java.util.Locale.ENGLISH));
        if (request.getSerialNumber() != null) item.setSerialNumber(request.getSerialNumber());
        if (request.getCompanyBarcode() != null) item.setCompanyBarcode(request.getCompanyBarcode());
        if (request.getBrand() != null) item.setBrand(request.getBrand());
        if (request.getModel() != null) item.setModel(request.getModel());
        if (request.getPowerCapacity() != null) item.setPowerCapacity(request.getPowerCapacity());
        if (request.getEnergySource() != null) item.setEnergySource(request.getEnergySource());
        if (request.getDimensions() != null) item.setDimensions(request.getDimensions());
        if (request.getMaterialType() != null) item.setMaterialType(request.getMaterialType());
        if (request.getModuleCount() != null) item.setModuleCount(request.getModuleCount());
        if (request.getInteriorDetails() != null) item.setInteriorDetails(request.getInteriorDetails());
        if (request.getSku() != null) item.setSku(request.getSku());
        if (request.getUnit() != null) item.setUnit(request.getUnit());
        if (request.getMinimumStock() != null) item.setMinimumStock(request.getMinimumStock());
        if (request.getCurrentStock() != null) item.setCurrentStock(request.getCurrentStock());
        if (request.getReorderPoint() != null) item.setReorderPoint(request.getReorderPoint());
        if (request.getReorderLeadDays() != null) item.setReorderLeadDays(request.getReorderLeadDays());
        if (request.getWarehouseLocation() != null) item.setWarehouseLocation(request.getWarehouseLocation());
        if (request.getBatchNumber() != null) item.setBatchNumber(request.getBatchNumber());
        if (request.getExpiryDate() != null) item.setExpiryDate(request.getExpiryDate());
        if (request.getStockCategory() != null) item.setStockCategory(request.getStockCategory());
        if (request.getAssignedTo() != null) item.setAssignedTo(request.getAssignedTo());
        if (request.getAssignedType() != null) item.setAssignedType(request.getAssignedType());
        if (request.getLocation() != null) item.setLocation(request.getLocation());
        if (request.getWarrantyExpiry() != null) item.setWarrantyExpiry(request.getWarrantyExpiry());
        if (request.getLastMaintenanceDate() != null) item.setLastMaintenanceDate(request.getLastMaintenanceDate());
        if (request.getPurchasePrice() != null) item.setPurchasePrice(request.getPurchasePrice());
        if (request.getPurchaseDate() != null) item.setPurchaseDate(request.getPurchaseDate());
        if (request.getNotes() != null) item.setNotes(request.getNotes());

        return toDto(inventoryItemRepository.save(item));
    }

    @Transactional
    public void deleteItem(UUID itemId, UUID actorUserId) {
        InventoryItem item = inventoryItemRepository.findById(itemId)
                .orElseThrow(() -> new IllegalArgumentException("Inventory item not found"));
        accessGuard.assertCanAccessBusiness(actorUserId, item.getBusiness().getId());
        item.setActive(false);
        inventoryItemRepository.save(item);
    }

    // ── Özet ──

    @Transactional(readOnly = true)
    public InventorySummaryDto getSummary(UUID businessId, UUID actorUserId) {
        accessGuard.assertCanReadBusiness(actorUserId, businessId);
        List<InventoryItem> items = inventoryItemRepository
                .findByBusinessIdAndActiveTrueOrderByCreatedAtDesc(businessId);

        long heavyVehicle = 0, lightEquipment = 0, siteSetup = 0, consumable = 0;
        long active = 0, broken = 0, inRepair = 0, lowStock = 0, warrantyExpiring = 0;
        BigDecimal totalValue = BigDecimal.ZERO;
        LocalDate soon = LocalDate.now().plusDays(30);

        for (InventoryItem item : items) {
            switch (item.getCategory()) {
                case "HEAVY_VEHICLE" -> heavyVehicle++;
                case "LIGHT_EQUIPMENT" -> lightEquipment++;
                case "SITE_SETUP" -> siteSetup++;
                case "CONSUMABLE" -> consumable++;
            }

            switch (item.getStatus()) {
                case "ACTIVE", "IN_STOCK" -> active++;
                case "BROKEN" -> broken++;
                case "IN_REPAIR" -> inRepair++;
            }

            // Akıllı reorder eşiği (manuel ya da minimum+lead tamponu). (WP f4fe6d82)
            if (reorderCalculator.compute(item).needsReorder()) {
                lowStock++;
            }

            if (item.getWarrantyExpiry() != null && item.getWarrantyExpiry().isBefore(soon)) {
                warrantyExpiring++;
            }

            if (item.getPurchasePrice() != null) {
                totalValue = totalValue.add(item.getPurchasePrice());
            }
        }

        return InventorySummaryDto.builder()
                .totalItems(items.size())
                .heavyVehicleCount(heavyVehicle)
                .lightEquipmentCount(lightEquipment)
                .siteSetupCount(siteSetup)
                .consumableCount(consumable)
                .activeCount(active)
                .brokenCount(broken)
                .inRepairCount(inRepair)
                .lowStockCount(lowStock)
                .warrantyExpiringCount(warrantyExpiring)
                .totalValue(totalValue)
                .build();
    }

    // ── Portfolio (tüm işletmeler) ──

    @Transactional(readOnly = true)
    public List<InventoryItemDto> getAllInventoryForUser(UUID userId, String category, UUID filterBusinessId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        List<Business> businesses;
        if ("admin".equalsIgnoreCase(user.getRole())) {
            businesses = businessRepository.findAll();
        } else {
            String accessible = user.getAccessibleBusinesses();
            if (accessible != null && !accessible.isBlank() && !"all".equalsIgnoreCase(accessible.trim())) {
                List<UUID> ids = java.util.Arrays.stream(accessible.split(","))
                        .map(String::trim).filter(s -> !s.isEmpty())
                        .map(UUID::fromString).toList();
                businesses = businessRepository.findByIdIn(ids);
            } else {
                businesses = businessRepository.findAll();
            }
        }

        List<UUID> businessIds = businesses.stream().map(Business::getId).toList();

        if (filterBusinessId != null) {
            if (!businessIds.contains(filterBusinessId)) return List.of();
            businessIds = List.of(filterBusinessId);
        }

        List<InventoryItem> items;
        if (category != null && !category.isBlank()) {
            String cat = category.toUpperCase(java.util.Locale.ENGLISH);
            items = new java.util.ArrayList<>();
            for (UUID bid : businessIds) {
                items.addAll(inventoryItemRepository
                        .findByBusinessIdAndCategoryAndActiveTrueOrderByCreatedAtDesc(bid, cat));
            }
        } else {
            items = inventoryItemRepository.findByBusinessIdInAndActiveTrueOrderByCreatedAtDesc(businessIds);
        }

        return items.stream().map(item -> {
            InventoryItemDto dto = toDto(item);
            dto.setBusinessName(item.getBusiness().getName());
            return dto;
        }).toList();
    }

    // ── Bakım Kayıtları ──

    @Transactional(readOnly = true)
    public List<MaintenanceLogDto> getMaintenanceLogs(UUID itemId, UUID actorUserId) {
        InventoryItem item = inventoryItemRepository.findById(itemId)
                .orElseThrow(() -> new IllegalArgumentException("Inventory item not found"));
        accessGuard.assertCanReadBusiness(actorUserId, item.getBusiness().getId());
        return maintenanceLogRepository.findByInventoryItemIdOrderByDateDesc(itemId)
                .stream().map(this::toMaintenanceDto).toList();
    }

    @Transactional
    public MaintenanceLogDto addMaintenanceLog(UUID itemId, CreateMaintenanceLogRequest request, UUID actorUserId) {
        InventoryItem item = inventoryItemRepository.findById(itemId)
                .orElseThrow(() -> new IllegalArgumentException("Inventory item not found"));
        accessGuard.assertCanAccessBusiness(actorUserId, item.getBusiness().getId());

        MaintenanceLog log = MaintenanceLog.builder()
                .inventoryItem(item)
                .maintenanceType(request.getMaintenanceType())
                .description(request.getDescription())
                .cost(request.getCost())
                .date(request.getDate())
                .performedBy(request.getPerformedBy())
                .notes(request.getNotes())
                .build();

        log = maintenanceLogRepository.save(log);

        // Son bakım tarihini güncelle
        item.setLastMaintenanceDate(request.getDate());
        inventoryItemRepository.save(item);

        return toMaintenanceDto(log);
    }

    // ── Yakıt Kayıtları ──

    @Transactional(readOnly = true)
    public List<FuelLogDto> getFuelLogs(UUID itemId, UUID actorUserId) {
        InventoryItem item = inventoryItemRepository.findById(itemId)
                .orElseThrow(() -> new IllegalArgumentException("Inventory item not found"));
        accessGuard.assertCanReadBusiness(actorUserId, item.getBusiness().getId());
        return fuelLogRepository.findByInventoryItemIdOrderByDateDesc(itemId)
                .stream().map(this::toFuelDto).toList();
    }

    @Transactional
    public FuelLogDto addFuelLog(UUID itemId, CreateFuelLogRequest request, UUID actorUserId) {
        InventoryItem item = inventoryItemRepository.findById(itemId)
                .orElseThrow(() -> new IllegalArgumentException("Inventory item not found"));
        accessGuard.assertCanAccessBusiness(actorUserId, item.getBusiness().getId());

        FuelLog log = FuelLog.builder()
                .inventoryItem(item)
                .fuelType(request.getFuelType())
                .amount(request.getAmount())
                .cost(request.getCost())
                .date(request.getDate())
                .odometerKm(request.getOdometerKm())
                .station(request.getStation())
                .receiptUrl(request.getReceiptUrl())
                .notes(request.getNotes())
                .build();

        return toFuelDto(fuelLogRepository.save(log));
    }

    // ── Mapper ──

    private InventoryItemDto toDto(InventoryItem item) {
        ReorderCalculator.Result reorder = reorderCalculator.compute(item);
        return InventoryItemDto.builder()
                .id(item.getId())
                .businessId(item.getBusiness().getId())
                .name(item.getName())
                .category(item.getCategory())
                .status(item.getStatus())
                .serialNumber(item.getSerialNumber())
                .companyBarcode(item.getCompanyBarcode())
                .brand(item.getBrand())
                .model(item.getModel())
                .powerCapacity(item.getPowerCapacity())
                .energySource(item.getEnergySource())
                .dimensions(item.getDimensions())
                .materialType(item.getMaterialType())
                .moduleCount(item.getModuleCount())
                .interiorDetails(item.getInteriorDetails())
                .sku(item.getSku())
                .unit(item.getUnit())
                .minimumStock(item.getMinimumStock())
                .currentStock(item.getCurrentStock())
                .reorderPoint(item.getReorderPoint())
                .reorderLeadDays(item.getReorderLeadDays())
                .effectiveReorderPoint(reorder.effectiveReorderPoint())
                .needsReorder(reorder.needsReorder())
                .suggestedOrderQuantity(reorder.suggestedOrderQuantity())
                .warehouseLocation(item.getWarehouseLocation())
                .batchNumber(item.getBatchNumber())
                .expiryDate(item.getExpiryDate())
                .stockCategory(item.getStockCategory())
                .assignedTo(item.getAssignedTo())
                .assignedType(item.getAssignedType())
                .location(item.getLocation())
                .warrantyExpiry(item.getWarrantyExpiry())
                .lastMaintenanceDate(item.getLastMaintenanceDate())
                .purchasePrice(item.getPurchasePrice())
                .purchaseDate(item.getPurchaseDate())
                .notes(item.getNotes())
                .active(item.isActive())
                .createdAt(item.getCreatedAt())
                .updatedAt(item.getUpdatedAt())
                .build();
    }

    private MaintenanceLogDto toMaintenanceDto(MaintenanceLog log) {
        return MaintenanceLogDto.builder()
                .id(log.getId())
                .inventoryItemId(log.getInventoryItem().getId())
                .maintenanceType(log.getMaintenanceType())
                .description(log.getDescription())
                .cost(log.getCost())
                .date(log.getDate())
                .performedBy(log.getPerformedBy())
                .notes(log.getNotes())
                .createdAt(log.getCreatedAt())
                .build();
    }

    private FuelLogDto toFuelDto(FuelLog log) {
        return FuelLogDto.builder()
                .id(log.getId())
                .inventoryItemId(log.getInventoryItem().getId())
                .fuelType(log.getFuelType())
                .amount(log.getAmount())
                .cost(log.getCost())
                .date(log.getDate())
                .odometerKm(log.getOdometerKm())
                .station(log.getStation())
                .receiptUrl(log.getReceiptUrl())
                .notes(log.getNotes())
                .createdAt(log.getCreatedAt())
                .build();
    }
}
