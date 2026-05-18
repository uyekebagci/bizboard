package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.BusinessDto;
import com.bizboard.common.dto.CategoryDto;
import com.bizboard.common.dto.CreateBusinessRequest;
import com.bizboard.common.entity.*;
import com.bizboard.common.enums.MemberRole;
import com.bizboard.common.enums.ModuleType;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.BusinessModuleRepository;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.CategoryRepository;
import com.bizboard.repository.FixedCostRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class BusinessService {

    private final BusinessRepository businessRepository;
    private final BusinessModuleRepository businessModuleRepository;
    private final CategoryRepository categoryRepository;
    private final FixedCostRepository fixedCostRepository;
    private final TransactionRepository transactionRepository;
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

        // v1.6.2: BusinessType master tablosu kaldırıldı. Kullanıcı sadece
        // business_type_name (serbest metin) gönderir; raporlama için kullanılır.
        // Default modules/categories artık tip'ten gelmez — kullanıcı wizard'da
        // kendi modüllerini seçer; kategoriler boş başlar, finans modülünden ekler.
        String typeName = request.getBusinessTypeName() != null
                ? request.getBusinessTypeName().trim() : null;
        if (typeName == null || typeName.isBlank()) {
            throw new IllegalArgumentException("Isletme tip adi zorunlu");
        }

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
                .name(request.getName())
                .businessTypeName(typeName)
                .description(request.getDescription())
                .color(request.getColor() != null ? request.getColor() : "#4c6ef5")
                .currency(request.getCurrency() != null ? request.getCurrency() : "TRY")
                .logoUrl(request.getLogoUrl())
                .metadata(metadata)
                .build();

        // Create modules — yalnız kullanıcının seçtikleri (master tip'ten geliş yok)
        List<String> moduleNames = request.getModules() != null && !request.getModules().isEmpty()
                ? request.getModules()
                : List.of("finance"); // fallback: en azından finans modülü
        for (String moduleName : moduleNames) {
            ModuleType moduleType = ModuleType.valueOf(moduleName.toUpperCase(java.util.Locale.ENGLISH));
            BusinessModule module = BusinessModule.builder()
                    .business(business)
                    .module(moduleType)
                    .enabled(true)
                    .build();
            business.getModules().add(module);
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

        // v1.5.7: yeni wizard manuel akışı — setup_costs[] ve monthly_fixed_costs[]
        // her ikisi de aynı transaction içinde üretilir; biri patlarsa rollback.
        int wizardSetupTxs = 0;
        int wizardFixedCosts = 0;
        if (request.getSetupCosts() != null) {
            for (com.bizboard.common.dto.WizardSetupCostItem item : request.getSetupCosts()) {
                if (item.getName() == null || item.getName().isBlank()) continue;
                if (item.getAmount() == null || item.getAmount().signum() <= 0) continue;
                Transaction tx = Transaction.builder()
                        .business(business)
                        .direction(TransactionDirection.EXPENSE)
                        .amount(item.getAmount())
                        .currency(business.getCurrency())
                        .description(item.getName() + " (kurulum)")
                        .date(java.time.LocalDate.now())
                        .setupCost(true)
                        .createdBy(owner)
                        .build();
                transactionRepository.save(tx);
                wizardSetupTxs++;
            }
        }
        if (request.getMonthlyFixedCosts() != null) {
            for (com.bizboard.common.dto.WizardMonthlyFixedCostItem item : request.getMonthlyFixedCosts()) {
                if (!item.isApplicable()) continue;
                if (item.getCategory() == null || item.getCategory().isBlank()) continue;
                if (item.getAmount() == null || item.getAmount().signum() <= 0) continue;
                com.bizboard.common.enums.FixedCostCategory cat =
                        com.bizboard.common.enums.FixedCostCategory.parse(item.getCategory());
                String fcName = item.getName() != null && !item.getName().isBlank()
                        ? item.getName() : cat.getLabel();
                FixedCost fc = FixedCost.builder()
                        .business(business)
                        .name(fcName)
                        .type(cat.name())
                        .amount(item.getAmount())
                        .frequency("MONTHLY")
                        .auto(false)
                        .build();
                fixedCostRepository.save(fc);
                wizardFixedCosts++;
            }
        }

        Map<String, Object> auditMeta = new HashMap<>();
        auditMeta.put("businessTypeName", typeName);
        auditMeta.put("modules", moduleNames);
        auditMeta.put("currency", business.getCurrency());
        if (wizardSetupTxs > 0 || wizardFixedCosts > 0) {
            auditMeta.put("wizardSetupTransactions", wizardSetupTxs);
            auditMeta.put("wizardMonthlyFixedCosts", wizardFixedCosts);
        }
        String extraDetail = "";
        if (wizardSetupTxs > 0 || wizardFixedCosts > 0) {
            extraDetail += " + wizard: " + wizardSetupTxs + " kurulum tx, " + wizardFixedCosts + " aylik gider";
        }
        auditLogService.recordEntityAction(
                AuditAction.BUSINESS_CREATE,
                owner.getId(), owner.getUsername(),
                "BUSINESS", business.getId(),
                "Isletme olusturuldu: " + business.getName() + " (" + typeName + ")" + extraDetail,
                auditMeta);

        return DtoMapper.toBusinessDto(business);
    }

    /**
     * v1.6.2: Admin-only işletme silme.
     *
     * <p>Cascade davranışı: Business entity'sinde {@code @OneToMany cascade=ALL,
     * orphanRemoval=true} olan ilişkiler (members, modules) otomatik silinir.
     * Diğer FK'ler ({@code transactions.business_id}, {@code fixed_costs.business_id},
     * vb.) Postgres ON DELETE davranışına bağlı. Bu sürümde basit kaskad:
     * tüm bağlı transaction, fixed_cost, employee, vehicle, inventory, debt,
     * note kayıtları otomatik repo cascade'i ile silinir.</p>
     *
     * <p>Audit log {@code BUSINESS_DELETE} action ile düşer; iş adı, type name,
     * silen admin id'si metadata'da.</p>
     */
    @Transactional
    public void deleteBusiness(UUID businessId, UUID actorUserId) {
        User actor = userRepository.findById(actorUserId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!"admin".equalsIgnoreCase(actor.getRole())) {
            throw new SecurityException("Sadece admin isletme silebilir");
        }
        Business b = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Isletme bulunamadi"));

        String name = b.getName();
        String typeName = b.getBusinessTypeName();

        // Cascade silme: önce bağlı kayıtları temizle (FK constraint'lere göre)
        // Hibernate cascade ALL bazı kayıtları otomatik temizler; geri kalanlar için
        // explicit repo cleanup.
        // Bağlı tüm transaction/fixed_cost/category vb. için repo silme çağrıları
        // burada eklenebilir; şu an manuel SQL kullanmak yerine entity cascade'lere
        // güveniyoruz. ORM cascade yoksa Postgres FK reddi olur → 409 dönüyor.
        try {
            businessRepository.delete(b);
            businessRepository.flush();
        } catch (org.springframework.dao.DataIntegrityViolationException ex) {
            log.warn("[business-delete] FK constraint engelledi: {}", ex.getMessage());
            throw new IllegalStateException(
                    "Bu isletmeye bagli kayitlar var (islem, sabit gider, personel vb.). " +
                    "Once onlari temizleyin veya destek ekibine basvurun.");
        }

        auditLogService.recordEntityAction(
                AuditAction.BUSINESS_DELETE,
                actor.getId(), actor.getUsername(),
                "BUSINESS", businessId,
                "Isletme silindi: " + name + " (" + typeName + ")",
                Map.of(
                        "businessName", name,
                        "businessTypeName", typeName != null ? typeName : ""
                ));
    }

    /**
     * Autocomplete listesi — kullanıcıların önceden girdiği distinct
     * `business_type_name`'ler. v1.6.2: master tablodan kaynak gelmiyor artık.
     */
    @Transactional(readOnly = true)
    public List<String> getBusinessTypeNameSuggestions() {
        return businessRepository.findDistinctBusinessTypeNames();
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
