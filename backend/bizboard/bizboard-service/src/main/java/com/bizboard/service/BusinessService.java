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
    // v1.6.23.25 (UI Fix WP TODO 5cf7590b): yeni işletme → otomatik Ana Kasa.
    private final BankAccountService bankAccountService;
    // İşletme kalıcı silme — scope'lu cascade motoru.
    private final BusinessCascadeDeleteService cascadeDeleteService;
    private final BusinessAccessGuard accessGuard;

    @Transactional(readOnly = true)
    public List<BusinessDto> getBusinessesForUser(UUID userId) {
        // Varsayılan: arşivlenmiş işletmeler GİZLİ.
        return getBusinessesForUser(userId, false);
    }

    /**
     * Kullanıcının erişebildiği işletmeler.
     *
     * @param includeArchived {@code false} (varsayılan) → arşivlenmişler gizli;
     *        {@code true} → arşivlenmişler de döner (Arşiv ekranı / geri yükleme
     *        listesi için). Çağrı erişim filtresi (admin / accessible / legacy)
     *        aynen korunur; arşiv yalnız ek bir post-filtre uygular.
     */
    @Transactional(readOnly = true)
    public List<BusinessDto> getBusinessesForUser(UUID userId, boolean includeArchived) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        String accessible = user.getAccessibleBusinesses();

        List<Business> businesses;
        // Admin veya "all" ise tüm işletmeleri döndür
        if ("admin".equalsIgnoreCase(user.getRole())
                || (accessible != null && "all".equalsIgnoreCase(accessible.trim()))) {
            businesses = businessRepository.findAll();
        } else if (accessible != null && !accessible.isBlank()) {
            // accessible_businesses sütunundaki UUID listesine göre filtrele
            List<UUID> ids = Arrays.stream(accessible.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(UUID::fromString)
                    .toList();
            businesses = businessRepository.findByIdIn(ids);
        } else {
            // Fallback: eski owner/member ilişkisine bak
            businesses = businessRepository.findAllAccessibleByUser(userId);
        }

        return businesses.stream()
                .filter(b -> includeArchived || !b.isArchived())
                .map(DtoMapper::toBusinessDto)
                .toList();
    }

    /**
     * Yalnız arşivlenmiş işletmeler — "Arşivden Çıkar" ekranı / filtresi için.
     */
    @Transactional(readOnly = true)
    public List<BusinessDto> getArchivedBusinessesForUser(UUID userId) {
        return getBusinessesForUser(userId, true).stream()
                .filter(BusinessDto::isArchived)
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

        // v1.6.2.1: BusinessType master tablosu + wizard Tip Seçimi adımı kaldırıldı.
        // business_type_name opsiyonel; verilirse raporlamada kullanılır, yoksa null.
        String typeName = request.getBusinessTypeName() != null
                && !request.getBusinessTypeName().isBlank()
                ? request.getBusinessTypeName().trim()
                : null;

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

        // Create modules — yalnız kullanıcının seçtikleri (master tip'ten geliş yok).
        // v1.7.0.x: NOTES her zaman default — kullanıcı seçmese de eklenir.
        java.util.LinkedHashSet<String> moduleNames = new java.util.LinkedHashSet<>();
        moduleNames.add("notes"); // her işletmede default Notlar modülü (ilk sıra)
        if (request.getModules() != null) {
            request.getModules().forEach(m -> moduleNames.add(m.toLowerCase(java.util.Locale.ENGLISH)));
        }
        if (moduleNames.size() == 1) {
            // Sadece notes varsa finans'ı da default ekle (geriye dönük uyum).
            moduleNames.add("finance");
        }
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

        // v1.6.23.25 (UI Fix WP TODO 5cf7590b): her yeni işletmeye otomatik
        // "Ana Kasa" hesabı oluştur — atomic; aynı transaction içinde, audit log'lu.
        // DB unique partial index ile aynı business için ikinci MAIN_CASH yaratma
        // (örn. retry race) deny edilir; bu yüzden ek try-catch'e gerek yok.
        bankAccountService.createMainCashForBusiness(business, owner.getId());

        // BUG-3: ayrıca sistem "Genel Nakit" CASH_HOLDER hesabını seed et (idempotent).
        // NAKIT/POS-gelir tx'leri bank_account_id boş geldiğinde buraya route edilir;
        // hesap yoksa account=NULL kalıp posting türetilemiyor (FLAGGED) → gün-kapanışı/
        // mutabakata girmiyordu. Aynı transaction içinde — atomik.
        bankAccountService.createSystemCashHolderForBusiness(business, owner.getId());

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
     * Arşivle (soft-delete, VARSAYILAN). İşletme {@code archived=true} olur:
     * varsayılan listelerden ve portföy/DGR agregalarından gizlenir, ancak
     * verisi korunur ve {@link #unarchiveBusiness} ile geri yüklenebilir.
     *
     * <p>Yetki: admin VEYA işletmeye erişimi olan kullanıcı
     * ({@link BusinessAccessGuard#assertCanAccessBusiness}). Geri-alınabilir
     * olduğu için arşive güçlü onay gerekmez (hafif onay FE'de).</p>
     */
    @Transactional
    public BusinessDto archiveBusiness(UUID businessId, UUID actorUserId) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        Business b = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Isletme bulunamadi"));
        User actor = userRepository.findById(actorUserId).orElse(null);

        if (!b.isArchived()) {
            b.setArchived(true);
            businessRepository.save(b);
            auditLogService.recordEntityAction(
                    AuditAction.BUSINESS_ARCHIVE,
                    actorUserId, actor != null ? actor.getUsername() : null,
                    "BUSINESS", businessId,
                    "Isletme arsivlendi: " + b.getName(),
                    Map.of("businessName", b.getName()));
        }
        return DtoMapper.toBusinessDto(b);
    }

    /**
     * Arşivden çıkar (geri yükleme). {@code archived=false} — işletme yeniden
     * listelerde ve agregalarda görünür.
     */
    @Transactional
    public BusinessDto unarchiveBusiness(UUID businessId, UUID actorUserId) {
        accessGuard.assertCanAccessBusiness(actorUserId, businessId);
        Business b = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Isletme bulunamadi"));
        User actor = userRepository.findById(actorUserId).orElse(null);

        if (b.isArchived()) {
            b.setArchived(false);
            businessRepository.save(b);
            auditLogService.recordEntityAction(
                    AuditAction.BUSINESS_UNARCHIVE,
                    actorUserId, actor != null ? actor.getUsername() : null,
                    "BUSINESS", businessId,
                    "Isletme arsivden cikarildi: " + b.getName(),
                    Map.of("businessName", b.getName()));
        }
        return DtoMapper.toBusinessDto(b);
    }

    /**
     * KALICI SİL (admin-only, GERİ ALINAMAZ, scope'lu cascade).
     *
     * <p>İşletmeye bağlı TÜM veri ({@code ~50} entity, çocuk→ebeveyn sırasında,
     * yalnız {@code business_id} kapsamında) {@link BusinessCascadeDeleteService}
     * ile silinir; ardından {@code businesses} satırı (cascade=ALL members/
     * modules ile) silinir. FK reddi olmaz; başka işletmenin/DGR'nin verisi
     * etkilenmez.</p>
     *
     * <p><b>Güçlü onay:</b> {@code confirmationName} işletme adıyla TAM eşleşmeli
     * (büyük/küçük harf duyarsız, trim). Eşleşmezse {@link IllegalArgumentException}.
     * (FE'de kullanıcı işletme adını yazarak teyit eder; bu BE kontrolü ikinci
     * savunma hattı.)</p>
     *
     * <p>Audit {@code BUSINESS_PURGE} ile düşer; tablo-başına silinen satır
     * sayıları metadata'da.</p>
     *
     * @param confirmationName FE'den gelen ad-eşleşme teyidi (zorunlu)
     */
    @Transactional
    public void purgeBusiness(UUID businessId, UUID actorUserId, String confirmationName) {
        User actor = userRepository.findById(actorUserId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!"admin".equalsIgnoreCase(actor.getRole())) {
            throw new SecurityException("Sadece admin isletme kalici silebilir");
        }
        Business b = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Isletme bulunamadi"));

        String name = b.getName();
        String typeName = b.getBusinessTypeName();

        // Güçlü onay: ad-eşleşme (BE ikinci savunma hattı — FE de zorlar).
        if (confirmationName == null
                || !confirmationName.trim().equalsIgnoreCase(name == null ? "" : name.trim())) {
            throw new IllegalArgumentException(
                    "Onay basarisiz: silmek icin isletme adini ('" + name + "') birebir yazmalisiniz.");
        }

        // 1) Bağlı TÜM child veriyi scope'lu cascade ile sil (FK-güvenli sıra).
        Map<String, Integer> deletedCounts = cascadeDeleteService.purgeBusinessChildren(businessId);

        // 2) businesses satırı — members/modules @OneToMany cascade=ALL ile gider.
        try {
            businessRepository.delete(b);
            businessRepository.flush();
        } catch (org.springframework.dao.DataIntegrityViolationException ex) {
            // Cascade'de atlanan bir FK kaldıysa burada yakalanır → teşhis logu.
            log.error("[business-purge] FK reddi (cascade'de atlanan tablo?): {}", ex.getMessage());
            throw new IllegalStateException(
                    "Isletme silinemedi: bagli bir kayit cascade kapsaminda degil. " +
                    "Hata detayi loglandi.");
        }

        int totalRows = deletedCounts.values().stream().mapToInt(Integer::intValue).sum();
        Map<String, Object> meta = new HashMap<>();
        meta.put("businessName", name);
        meta.put("businessTypeName", typeName != null ? typeName : "");
        meta.put("deletedRowsTotal", totalRows);
        meta.put("deletedByTable", deletedCounts);
        auditLogService.recordEntityAction(
                AuditAction.BUSINESS_PURGE,
                actor.getId(), actor.getUsername(),
                "BUSINESS", businessId,
                "Isletme KALICI silindi: " + name + " (" + typeName + ") — "
                        + totalRows + " bagli kayit silindi",
                meta);
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
