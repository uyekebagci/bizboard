package com.bizboard.service;

import com.bizboard.common.dto.*;
import com.bizboard.common.entity.*;
import com.bizboard.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * v1.6.23.12 (WP 3c8401f6): Phone device + bank assignment CRUD servisi.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PhoneDeviceService {

    private final PhoneDeviceRepository deviceRepository;
    private final PhoneBrandRepository brandRepository;
    private final PhoneModelRepository modelRepository;
    private final BusinessRepository businessRepository;
    private final CounterpartRepository counterpartRepository;
    private final AuditLogService auditLogService;
    private final UserRepository userRepository;
    private final BusinessAccessGuard accessGuard;

    @Transactional(readOnly = true)
    public List<PhoneBrandDto> listBrands(boolean includeInactive) {
        List<PhoneBrand> rows = includeInactive
                ? brandRepository.findAllByOrderBySortOrderAscNameAsc()
                : brandRepository.findByActiveTrueOrderBySortOrderAscNameAsc();
        // Per-brand model count (aktif modeller)
        return rows.stream().map(b -> {
            int count = modelRepository.findByBrandIdAndActiveTrueOrderByNameAsc(b.getId()).size();
            return PhoneBrandDto.builder()
                    .id(b.getId()).name(b.getName()).slug(b.getSlug())
                    .sortOrder(b.getSortOrder()).active(b.isActive())
                    .modelCount(count)
                    .build();
        }).toList();
    }

    @Transactional(readOnly = true)
    public List<PhoneModelDto> listModels(UUID brandId, boolean includeInactive) {
        if (brandId == null) {
            return modelRepository.findAll().stream().map(this::toModelDto).toList();
        }
        List<PhoneModel> rows = includeInactive
                ? modelRepository.findByBrandIdOrderByNameAsc(brandId)
                : modelRepository.findByBrandIdAndActiveTrueOrderByNameAsc(brandId);
        return rows.stream().map(this::toModelDto).toList();
    }

    /**
     * v1.6.23.20 (Security WP TODO 15b1dd12): list multi-tenant filter.
     *
     * <p>businessId param verilirse o işletmeye actor erişebiliyor mu kontrol
     * edilir. Verilmezse actor'ın erişebildiği TÜM işletmelerin telefonları
     * döner — cross-tenant LEAK kapalıdır.</p>
     */
    @Transactional(readOnly = true)
    public List<PhoneDeviceDto> listDevices(UUID businessId, boolean includeInactive, UUID actorUserId) {
        List<UUID> allowed = accessGuard.accessibleBusinessIds(actorUserId);
        if (allowed.isEmpty()) return List.of();

        List<UUID> effective;
        if (businessId != null) {
            // Explicit business — actor erişebiliyor mu?
            if (!allowed.contains(businessId)) return List.of();
            effective = List.of(businessId);
        } else {
            effective = allowed;
        }

        List<PhoneDevice> rows = includeInactive
                ? deviceRepository.findByBusinessIdInOrderByDeviceNumberAsc(effective)
                : deviceRepository.findByBusinessIdInAndActiveTrueOrderByDeviceNumberAsc(effective);
        return rows.stream().map(this::toDeviceDto).toList();
    }

    /**
     * v1.6.23.20 (Security WP TODO 15b1dd12): counterpart-bazlı listede de
     * sadece erişebildiği tenant'ların telefonları döner.
     */
    @Transactional(readOnly = true)
    public List<PhoneDeviceDto> listByCounterpart(UUID counterpartId, UUID actorUserId) {
        List<UUID> allowed = accessGuard.accessibleBusinessIds(actorUserId);
        if (allowed.isEmpty()) return List.of();
        return deviceRepository.findByAssignedCounterpartIdOrderByDeviceNumberAsc(counterpartId)
                .stream()
                .filter(d -> d.getBusiness() != null && allowed.contains(d.getBusiness().getId()))
                .map(this::toDeviceDto)
                .toList();
    }

    @Transactional
    public PhoneDeviceDto create(CreatePhoneDeviceRequest req, UUID actorUserId) {
        Business business = businessRepository.findById(req.getBusinessId())
                .orElseThrow(() -> new IllegalArgumentException("Business bulunamadi"));
        // v1.6.23.20 (Security WP TODO 15b1dd12): cross-tenant create engeli.
        accessGuard.assertCanAccessBusiness(actorUserId, business.getId());

        validateBrandModel(req.getBrandId(), req.getModelId(), req.getCustomModel());

        PhoneBrand brand = req.getBrandId() != null
                ? brandRepository.findById(req.getBrandId())
                        .orElseThrow(() -> new IllegalArgumentException("Brand bulunamadi"))
                : null;
        PhoneModel model = req.getModelId() != null
                ? modelRepository.findById(req.getModelId())
                        .orElseThrow(() -> new IllegalArgumentException("Model bulunamadi"))
                : null;
        if (brand != null && model != null && !model.getBrand().getId().equals(brand.getId())) {
            throw new IllegalArgumentException("Model bu marka altinda degil");
        }

        Counterpart assignee = req.getAssignedCounterpartId() != null
                ? counterpartRepository.findById(req.getAssignedCounterpartId())
                        .orElseThrow(() -> new IllegalArgumentException("Karsi firma bulunamadi"))
                : null;

        int deviceNumber = req.getDeviceNumber() != null
                ? req.getDeviceNumber()
                : deviceRepository.findMaxDeviceNumberByBusinessId(business.getId()) + 1;

        PhoneDevice device = PhoneDevice.builder()
                .business(business)
                .deviceNumber(deviceNumber)
                .phoneNumber(req.getPhoneNumber())
                .assignedCounterpart(assignee)
                .brand(brand)
                .model(model)
                .customModel(req.getCustomModel())
                .notes(req.getNotes())
                .active(true)
                .build();
        device = deviceRepository.save(device);

        // Banks
        if (req.getBanks() != null) {
            for (PhoneDeviceBankDto b : req.getBanks()) {
                if (b == null || b.getBankName() == null || b.getBankName().isBlank()) continue;
                PhoneDeviceBank bank = PhoneDeviceBank.builder()
                        .phoneDevice(device)
                        .bankName(b.getBankName().trim())
                        .appUsername(b.getAppUsername())
                        .notes(b.getNotes())
                        .build();
                device.getBanks().add(bank);
            }
            device = deviceRepository.save(device);
        }

        recordAudit("PHONE_DEVICE_CREATED", actorUserId, device,
                "Phone device #" + device.getDeviceNumber() + " created");
        return toDeviceDto(device);
    }

    @Transactional
    public PhoneDeviceDto update(UUID id, UpdatePhoneDeviceRequest req, UUID actorUserId) {
        PhoneDevice device = deviceRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Phone device bulunamadi"));
        // v1.6.23.20 (Security WP TODO 15b1dd12): cross-tenant update engeli.
        accessGuard.assertCanAccessBusiness(actorUserId,
                device.getBusiness() != null ? device.getBusiness().getId() : null);

        if (req.getPhoneNumber() != null) device.setPhoneNumber(req.getPhoneNumber());
        if (req.getNotes() != null) device.setNotes(req.getNotes());
        if (req.getActive() != null) device.setActive(req.getActive());

        // Assigned counterpart
        if (Boolean.TRUE.equals(req.getClearAssignedCounterpart())) {
            device.setAssignedCounterpart(null);
        } else if (req.getAssignedCounterpartId() != null) {
            device.setAssignedCounterpart(counterpartRepository.findById(req.getAssignedCounterpartId())
                    .orElseThrow(() -> new IllegalArgumentException("Karsi firma bulunamadi")));
        }

        // Brand
        if (Boolean.TRUE.equals(req.getClearBrand())) device.setBrand(null);
        else if (req.getBrandId() != null) {
            device.setBrand(brandRepository.findById(req.getBrandId())
                    .orElseThrow(() -> new IllegalArgumentException("Brand bulunamadi")));
        }
        // Model
        if (Boolean.TRUE.equals(req.getClearModel())) device.setModel(null);
        else if (req.getModelId() != null) {
            PhoneModel m = modelRepository.findById(req.getModelId())
                    .orElseThrow(() -> new IllegalArgumentException("Model bulunamadi"));
            if (device.getBrand() != null && !m.getBrand().getId().equals(device.getBrand().getId())) {
                throw new IllegalArgumentException("Model bu marka altinda degil");
            }
            device.setModel(m);
        }
        // Custom model
        if (req.getCustomModel() != null) {
            device.setCustomModel(req.getCustomModel().isBlank() ? null : req.getCustomModel());
        }

        // Mutex validation: brand+model vs customModel
        UUID brandId = device.getBrand() != null ? device.getBrand().getId() : null;
        UUID modelId = device.getModel() != null ? device.getModel().getId() : null;
        validateBrandModel(brandId, modelId, device.getCustomModel());

        device = deviceRepository.save(device);
        recordAudit("PHONE_DEVICE_UPDATED", actorUserId, device,
                "Phone device #" + device.getDeviceNumber() + " updated");
        return toDeviceDto(device);
    }

    @Transactional
    public void softDelete(UUID id, UUID actorUserId) {
        PhoneDevice device = deviceRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Phone device bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId,
                device.getBusiness() != null ? device.getBusiness().getId() : null);
        device.setActive(false);
        deviceRepository.save(device);
        recordAudit("PHONE_DEVICE_DEACTIVATED", actorUserId, device,
                "Phone device #" + device.getDeviceNumber() + " deactivated");
    }

    // ── Banks sub-resource ────────────────────────────────────

    @Transactional
    public PhoneDeviceDto addBank(UUID deviceId, PhoneDeviceBankDto req, UUID actorUserId) {
        PhoneDevice device = deviceRepository.findById(deviceId)
                .orElseThrow(() -> new IllegalArgumentException("Phone device bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId,
                device.getBusiness() != null ? device.getBusiness().getId() : null);
        if (req.getBankName() == null || req.getBankName().isBlank()) {
            throw new IllegalArgumentException("bank_name zorunlu");
        }
        // Idempotent — aynı bank zaten varsa update et
        Optional<PhoneDeviceBank> existing = device.getBanks().stream()
                .filter(b -> b.getBankName().equalsIgnoreCase(req.getBankName().trim()))
                .findFirst();
        if (existing.isPresent()) {
            PhoneDeviceBank b = existing.get();
            b.setAppUsername(req.getAppUsername());
            b.setNotes(req.getNotes());
        } else {
            device.getBanks().add(PhoneDeviceBank.builder()
                    .phoneDevice(device)
                    .bankName(req.getBankName().trim())
                    .appUsername(req.getAppUsername())
                    .notes(req.getNotes())
                    .build());
        }
        device = deviceRepository.save(device);
        recordAudit("PHONE_BANK_ADDED", actorUserId, device,
                "Bank '" + req.getBankName() + "' eklendi phone #" + device.getDeviceNumber());
        return toDeviceDto(device);
    }

    @Transactional
    public PhoneDeviceDto removeBank(UUID deviceId, String bankName, UUID actorUserId) {
        PhoneDevice device = deviceRepository.findById(deviceId)
                .orElseThrow(() -> new IllegalArgumentException("Phone device bulunamadi"));
        accessGuard.assertCanAccessBusiness(actorUserId,
                device.getBusiness() != null ? device.getBusiness().getId() : null);
        device.getBanks().removeIf(b -> b.getBankName().equalsIgnoreCase(bankName));
        device = deviceRepository.save(device);
        recordAudit("PHONE_BANK_REMOVED", actorUserId, device,
                "Bank '" + bankName + "' silindi phone #" + device.getDeviceNumber());
        return toDeviceDto(device);
    }

    // ── Helpers ───────────────────────────────────────────────

    private void validateBrandModel(UUID brandId, UUID modelId, String customModel) {
        boolean hasMaster = brandId != null || modelId != null;
        boolean hasCustom = customModel != null && !customModel.isBlank();
        if (hasMaster && hasCustom) {
            throw new IllegalArgumentException(
                    "brand_id/model_id ile custom_model birlikte verilemez — biri YA da diğeri");
        }
        if (modelId != null && brandId == null) {
            throw new IllegalArgumentException("model_id verildiyse brand_id de zorunlu");
        }
    }

    private void recordAudit(String action, UUID actorUserId, PhoneDevice device, String desc) {
        String username = actorUserId != null
                ? userRepository.findById(actorUserId).map(User::getUsername).orElse(null)
                : null;
        auditLogService.recordEntityAction(
                action, actorUserId, username,
                "PHONE_DEVICE", device.getId(), desc,
                Map.of("businessId", device.getBusiness().getId(),
                        "deviceNumber", device.getDeviceNumber()));
    }

    public PhoneDeviceDto toDeviceDto(PhoneDevice d) {
        String label;
        if (d.getCustomModel() != null && !d.getCustomModel().isBlank()) {
            label = d.getCustomModel();
        } else if (d.getBrand() != null && d.getModel() != null) {
            label = d.getBrand().getName() + " " + d.getModel().getName();
        } else if (d.getBrand() != null) {
            label = d.getBrand().getName();
        } else {
            label = "—";
        }
        List<PhoneDeviceBankDto> bankDtos = d.getBanks().stream()
                .sorted(Comparator.comparing(PhoneDeviceBank::getBankName))
                .map(b -> PhoneDeviceBankDto.builder()
                        .bankName(b.getBankName())
                        .appUsername(b.getAppUsername())
                        .notes(b.getNotes())
                        .build())
                .collect(Collectors.toList());
        return PhoneDeviceDto.builder()
                .id(d.getId())
                .businessId(d.getBusiness().getId())
                .businessName(d.getBusiness().getName())
                .deviceNumber(d.getDeviceNumber())
                .phoneNumber(d.getPhoneNumber())
                .assignedCounterpartId(d.getAssignedCounterpart() != null ? d.getAssignedCounterpart().getId() : null)
                .assignedCounterpartName(d.getAssignedCounterpart() != null ? d.getAssignedCounterpart().getName() : null)
                .brandId(d.getBrand() != null ? d.getBrand().getId() : null)
                .brandName(d.getBrand() != null ? d.getBrand().getName() : null)
                .modelId(d.getModel() != null ? d.getModel().getId() : null)
                .modelName(d.getModel() != null ? d.getModel().getName() : null)
                .customModel(d.getCustomModel())
                .displayLabel(label)
                .notes(d.getNotes())
                .active(d.isActive())
                .banks(bankDtos)
                .createdAt(d.getCreatedAt())
                .updatedAt(d.getUpdatedAt())
                .build();
    }

    private PhoneModelDto toModelDto(PhoneModel m) {
        return PhoneModelDto.builder()
                .id(m.getId())
                .brandId(m.getBrand().getId())
                .brandName(m.getBrand().getName())
                .name(m.getName())
                .releaseYear(m.getReleaseYear())
                .active(m.isActive())
                .build();
    }
}
