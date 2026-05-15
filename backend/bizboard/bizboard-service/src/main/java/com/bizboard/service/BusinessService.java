package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.BusinessDto;
import com.bizboard.common.dto.BusinessTypeDto;
import com.bizboard.common.dto.CategoryDto;
import com.bizboard.common.dto.CreateBusinessRequest;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.MemberRole;
import com.bizboard.common.enums.ModuleType;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.BusinessModuleRepository;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.BusinessTypeRepository;
import com.bizboard.repository.CategoryRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
@RequiredArgsConstructor
public class BusinessService {

    private final BusinessRepository businessRepository;
    private final BusinessModuleRepository businessModuleRepository;
    private final BusinessTypeRepository businessTypeRepository;
    private final CategoryRepository categoryRepository;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;

    @Transactional(readOnly = true)
    public List<BusinessDto> getBusinessesForUser(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        String accessible = user.getAccessibleBusinesses();

        // Admin veya "all" ise tüm işletmeleri döndür
        if ("admin".equalsIgnoreCase(user.getRole())
                || (accessible != null && "all".equalsIgnoreCase(accessible.trim()))) {
            return businessRepository.findAll().stream()
                    .map(DtoMapper::toBusinessDto)
                    .toList();
        }

        // accessible_businesses sütunundaki UUID listesine göre filtrele
        if (accessible != null && !accessible.isBlank()) {
            List<UUID> ids = Arrays.stream(accessible.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(UUID::fromString)
                    .toList();
            return businessRepository.findByIdIn(ids).stream()
                    .map(DtoMapper::toBusinessDto)
                    .toList();
        }

        // Fallback: eski owner/member ilişkisine bak
        return businessRepository.findAllAccessibleByUser(userId).stream()
                .map(DtoMapper::toBusinessDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public BusinessDto getBusinessById(UUID businessId, UUID userId) {
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Admin her şeyi görebilir
        if ("admin".equalsIgnoreCase(user.getRole())) {
            return DtoMapper.toBusinessDto(business);
        }

        // accessible_businesses kontrolü
        String accessible = user.getAccessibleBusinesses();
        if (accessible != null && !accessible.isBlank()) {
            if ("all".equalsIgnoreCase(accessible.trim())) {
                return DtoMapper.toBusinessDto(business);
            }
            boolean hasAccess = Arrays.stream(accessible.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .anyMatch(s -> s.equals(businessId.toString()));
            if (hasAccess) {
                return DtoMapper.toBusinessDto(business);
            }
        }

        // Fallback: eski owner/member ilişkisi
        boolean hasAccess = business.getOwner().getId().equals(userId)
                || business.getMembers().stream()
                .anyMatch(m -> m.getUser().getId().equals(userId));

        if (!hasAccess) {
            throw new SecurityException("Access denied");
        }

        return DtoMapper.toBusinessDto(business);
    }

    @Transactional
    public BusinessDto createBusiness(CreateBusinessRequest request, UUID userId) {
        User owner = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        BusinessType businessType = businessTypeRepository.findById(request.getBusinessTypeId())
                .orElseThrow(() -> new IllegalArgumentException("Business type not found"));

        // Build metadata
        Map<String, Object> metadata = new HashMap<>();
        if (request.getMetadata() != null) {
            metadata.putAll(request.getMetadata());
        }
        if (request.isMockup()) {
            metadata.put("is_mockup", true);
        }

        Business business = Business.builder()
                .owner(owner)
                .businessType(businessType)
                .name(request.getName())
                .description(request.getDescription())
                .color(request.getColor() != null ? request.getColor() : businessType.getColor())
                .currency(request.getCurrency() != null ? request.getCurrency() : "TRY")
                .logoUrl(request.getLogoUrl())
                .metadata(metadata)
                .build();

        // Create modules
        List<String> moduleNames = request.getModules() != null && !request.getModules().isEmpty()
                ? request.getModules()
                : businessType.getDefaultModules();

        if (moduleNames != null) {
            for (String moduleName : moduleNames) {
                ModuleType moduleType = ModuleType.valueOf(moduleName.toUpperCase(java.util.Locale.ENGLISH));
                BusinessModule module = BusinessModule.builder()
                        .business(business)
                        .module(moduleType)
                        .enabled(true)
                        .build();
                business.getModules().add(module);
            }
        }

        // Create owner membership
        BusinessMember ownerMember = BusinessMember.builder()
                .business(business)
                .user(owner)
                .role(MemberRole.OWNER)
                .accepted(true)
                .build();
        business.getMembers().add(ownerMember);

        // Save business (cascades modules and members)
        business = businessRepository.save(business);

        // Create default categories from business type
        if (businessType.getDefaultCategories() != null) {
            int sortOrder = 0;
            for (Map<String, String> catDef : businessType.getDefaultCategories()) {
                Category category = Category.builder()
                        .business(business)
                        .name(catDef.get("name"))
                        .direction(TransactionDirection.valueOf(catDef.get("direction").toUpperCase(java.util.Locale.ENGLISH)))
                        .icon(catDef.get("icon"))
                        .color(catDef.get("color"))
                        .sortOrder(sortOrder++)
                        .build();
                categoryRepository.save(category);
            }
        }

        auditLogService.recordEntityAction(
                AuditAction.BUSINESS_CREATE,
                owner.getId(), owner.getUsername(),
                "BUSINESS", business.getId(),
                "Isletme olusturuldu: " + business.getName() + " (" + businessType.getLabel() + ")",
                Map.of(
                        "businessTypeId", businessType.getId(),
                        "businessTypeLabel", businessType.getLabel(),
                        "modules", moduleNames != null ? moduleNames : List.of(),
                        "currency", business.getCurrency()
                ));

        return DtoMapper.toBusinessDto(business);
    }

    @Transactional(readOnly = true)
    public List<BusinessTypeDto> getAllBusinessTypes() {
        return businessTypeRepository.findAll().stream()
                .map(DtoMapper::toBusinessTypeDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CategoryDto> getCategoriesForBusiness(UUID businessId, UUID userId) {
        // Erişim kontrolü — getBusinessById zaten kontrol ediyor
        getBusinessById(businessId, userId);

        return categoryRepository.findByBusinessIdAndActiveTrueOrderBySortOrder(businessId).stream()
                .map(DtoMapper::toCategoryDto)
                .toList();
    }

    @Transactional
    public BusinessDto addModule(UUID businessId, String moduleName, UUID actorUserId) {
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        ModuleType moduleType = ModuleType.valueOf(moduleName.toUpperCase(java.util.Locale.ENGLISH));

        // Zaten varsa enable et
        var existing = businessModuleRepository.findByBusinessIdAndModule(businessId, moduleType);
        boolean wasEnabled = existing.map(BusinessModule::isEnabled).orElse(false);
        if (existing.isPresent()) {
            existing.get().setEnabled(true);
            businessModuleRepository.save(existing.get());
        } else {
            BusinessModule module = BusinessModule.builder()
                    .business(business)
                    .module(moduleType)
                    .enabled(true)
                    .build();
            business.getModules().add(module);
            businessRepository.save(business);
        }

        if (!wasEnabled) {
            User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
            auditLogService.recordEntityAction(
                    AuditAction.BUSINESS_MODULE_ADD,
                    actorUserId, actor != null ? actor.getUsername() : null,
                    "BUSINESS", businessId,
                    business.getName() + " — modul eklendi: " + moduleType.name(),
                    Map.of(
                            "businessId", businessId,
                            "module", moduleType.name()
                    ));
        }

        // Güncel hali döndür
        return DtoMapper.toBusinessDto(businessRepository.findById(businessId).orElseThrow());
    }

    @Transactional
    public BusinessDto removeModule(UUID businessId, String moduleName, UUID actorUserId) {
        ModuleType moduleType = ModuleType.valueOf(moduleName.toUpperCase(java.util.Locale.ENGLISH));

        var existing = businessModuleRepository.findByBusinessIdAndModule(businessId, moduleType);
        boolean wasEnabled = existing.map(BusinessModule::isEnabled).orElse(false);
        if (existing.isPresent()) {
            existing.get().setEnabled(false);
            businessModuleRepository.save(existing.get());
        }

        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        if (wasEnabled) {
            User actor = actorUserId != null ? userRepository.findById(actorUserId).orElse(null) : null;
            auditLogService.recordEntityAction(
                    AuditAction.BUSINESS_MODULE_REMOVE,
                    actorUserId, actor != null ? actor.getUsername() : null,
                    "BUSINESS", businessId,
                    business.getName() + " — modul kaldirildi: " + moduleType.name(),
                    Map.of(
                            "businessId", businessId,
                            "module", moduleType.name()
                    ));
        }

        return DtoMapper.toBusinessDto(business);
    }
}
