package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CategoryDto;
import com.bizboard.common.dto.CreateCategoryRequest;
import com.bizboard.common.dto.UpdateCategoryRequest;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Category;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.CategoryApplicability;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.CategoryRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * Kategori CRUD. Paylaşımlı (yön-bağımsız) model: bir kategori hem gelir hem
 * gider işlemlerinde kullanılabilir; kategoriler per-business tutulur. Erişim
 * {@link BusinessAccessGuard} (business sahipliği) ile korunur.
 *
 * <p>DELETE soft-delete'tir (active=false): bağlı transaction'lar category_id'yi
 * tutmaya devam eder ve raporda kategori adıyla görünür.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final BusinessRepository businessRepository;
    private final UserRepository userRepository;
    private final TransactionRepository transactionRepository;
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;

    /**
     * Sistem backfill kategorisinin adı ({@code CategoryRequiredMigrationRunner}
     * ile aynı). Live veride hem "Diğer" (Türkçe ğ) hem "Diger" (ASCII) varyantı
     * görülebildiği için eşleştirme her ikisini de kabul eder ({@link #isOtherName}).
     */
    private static final String OTHER_NAME = "Diğer";

    @Transactional
    public CategoryDto createCategory(UUID businessId, CreateCategoryRequest request, UUID userId) {
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        accessGuard.assertCanAccessBusiness(userId, businessId);

        String name = request.getName() != null ? request.getName().trim() : "";
        if (name.isEmpty()) {
            throw new IllegalArgumentException("Kategori adi zorunlu");
        }

        // Paylaşımlı model: kategoriler yön-bağımsız. request.direction eski
        // client'lardan gelebilir ama YOK SAYILIR (kategori paylaşımlı/null).
        // Aynı business içinde aktif isim çakışmasını engelle (yön-bağımsız).
        categoryRepository.findFirstByBusinessIdAndNameIgnoreCaseAndActiveTrue(
                businessId, name).ifPresent(existing -> {
            throw new IllegalArgumentException(
                    "Ayni isimde bir kategori zaten var: " + name);
        });

        Category category = Category.builder()
                .business(business)
                .name(name)
                .direction(null) // paylaşımlı (yön-bağımsız)
                // Ledger v2 (Faz A, §3.9): hibrit uygulanabilirlik — default BOTH.
                .applicability(parseApplicability(
                        request.getApplicability(), CategoryApplicability.BOTH))
                .icon(request.getIcon())
                .color(request.getColor())
                .sortOrder(request.getSortOrder() != null ? request.getSortOrder() : 0)
                .active(true)
                .build();

        category = categoryRepository.save(category);

        recordAudit(AuditAction.CATEGORY_CREATE, userId, businessId, business.getName(), category,
                business.getName() + " — kategori olusturuldu: " + category.getName()
                        + " (paylasimli)");

        return DtoMapper.toCategoryDto(category);
    }

    @Transactional
    public CategoryDto updateCategory(UUID categoryId, UpdateCategoryRequest request, UUID userId) {
        Category category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new IllegalArgumentException("Kategori bulunamadi"));

        Business business = category.getBusiness();
        accessGuard.assertCanAccessBusiness(userId, business.getId());

        // Sistem "Diğer" kategorisi koruması: migration-yönetimli backfill
        // kategorisidir (CategoryRequiredMigrationRunner). Adı değiştirilemez —
        // aksi halde NULL-kategorili tx backfill hedefi kaybolur ve restart'ta
        // mükerrer "Diğer" oluşur. icon/color/sort_order/applicability serbest.
        if (isSystemOtherCategory(category) && request.getName() != null
                && !isOtherName(request.getName())) {
            throw new IllegalStateException(
                    "Sistem '" + OTHER_NAME + "' kategorisinin adi degistirilemez");
        }

        if (request.getName() != null) {
            String newName = request.getName().trim();
            if (newName.isEmpty()) {
                throw new IllegalArgumentException("Kategori adi bos olamaz");
            }
            // Paylaşımlı model: yeni isim aynı business içinde başka aktif
            // kategoriyle çakışmasın (yön-bağımsız).
            if (!newName.equalsIgnoreCase(category.getName())) {
                categoryRepository.findFirstByBusinessIdAndNameIgnoreCaseAndActiveTrue(
                        business.getId(), newName).ifPresent(existing -> {
                    throw new IllegalArgumentException(
                            "Ayni isimde bir kategori zaten var: " + newName);
                });
            }
            category.setName(newName);
        }
        if (request.getIcon() != null) {
            category.setIcon(request.getIcon());
        }
        if (request.getColor() != null) {
            category.setColor(request.getColor());
        }
        if (request.getSortOrder() != null) {
            category.setSortOrder(request.getSortOrder());
        }
        // Ledger v2 (Faz A, §3.9): tek-tarafa-kilit kullanıcı kararı (STRICT).
        // Verilmezse mevcut değer korunur; geçersiz değer yok sayılır.
        if (request.getApplicability() != null) {
            CategoryApplicability appl = parseApplicability(request.getApplicability(), null);
            if (appl != null) {
                category.setApplicability(appl);
            }
        }

        category = categoryRepository.save(category);

        recordAudit(AuditAction.CATEGORY_UPDATE, userId, business.getId(), business.getName(), category,
                business.getName() + " — kategori guncellendi: " + category.getName());

        return DtoMapper.toCategoryDto(category);
    }

    /**
     * Soft-delete: kategori pasifleştirilir (active=false). Bağlı transaction'lar
     * category_id'yi tutmaya devam eder; raporda kategori adıyla görünür.
     */
    @Transactional
    public void deleteCategory(UUID categoryId, UUID userId) {
        Category category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new IllegalArgumentException("Kategori bulunamadi"));

        Business business = category.getBusiness();
        accessGuard.assertCanAccessBusiness(userId, business.getId());

        // Sistem "Diğer" kategorisi koruması: silinemez (soft-delete dahil).
        // tx backfill hedefi + NOT NULL category_id zorunluluğu buna bağlı.
        if (isSystemOtherCategory(category)) {
            throw new IllegalStateException(
                    "Sistem '" + OTHER_NAME + "' kategorisi silinemez");
        }

        if (!category.isActive()) {
            // Idempotent: zaten pasif — no-op.
            return;
        }
        category.setActive(false);
        categoryRepository.save(category);

        // Temizlik (idempotent): bu kategoriye bağlı tx'leri işletmenin AKTİF "Diğer"
        // kategorisine taşı. category_id NOT NULL olduğundan null bırakılamaz; repoint
        // ile orphan/stale referans kalmaz ve kategori kırılımı "Diğer" altında
        // tutarlı görünür. Tutar/işlem KAYBOLMAZ — sadece kategori etiketi değişir.
        // Hedef "Diğer" bulunamazsa (migration garantili, defansif) tx'ler dokunulmaz;
        // okuma tarafı (buildCategoryBreakdown) zaten pasif kategoriyi "Diğer"e çözer.
        int repointed = repointToOther(business.getId(), categoryId);

        recordAudit(AuditAction.CATEGORY_DELETE, userId, business.getId(), business.getName(), category,
                business.getName() + " — kategori pasiflestirildi (soft-delete): " + category.getName()
                        + (repointed > 0 ? " — " + repointed + " islem '" + OTHER_NAME + "'e tasindi" : ""));
    }

    /**
     * Silinen kategoriye bağlı tx'leri işletmenin AKTİF "Diğer" kategorisine
     * yönlendirir (idempotent). Hedef yoksa (defansif) hiçbir şey yapmaz.
     *
     * @return taşınan tx sayısı (hedef yoksa 0)
     */
    private int repointToOther(UUID businessId, UUID deletedCategoryId) {
        Category other = categoryRepository
                .findFirstByBusinessIdAndNameIgnoreCaseAndActiveTrue(businessId, OTHER_NAME)
                .orElse(null);
        if (other == null) {
            log.warn("[category] '{}' kategorisi bulunamadi (business={}); tx repoint atlandi.",
                    OTHER_NAME, businessId);
            return 0;
        }
        if (other.getId().equals(deletedCategoryId)) {
            // "Diğer" zaten silinemez (isSystemOtherCategory koruması); defansif no-op.
            return 0;
        }
        return transactionRepository.repointCategory(deletedCategoryId, other.getId());
    }

    // ───────── helpers ─────────

    /**
     * Migration-yönetimli sistem "Diğer" kategorisi mi? Ada göre tespit edilir
     * (case-insensitive; "Diğer"/"Diger" varyantları). Rename/delete koruması
     * yalnız aktif kayıt için anlamlı; pasif kalıntılar zaten dokunulmaz.
     */
    private boolean isSystemOtherCategory(Category category) {
        return category != null && category.isActive() && isOtherName(category.getName());
    }

    /** "Diğer" / "Diger" (ASCII fallback) eşleştirmesi — case-insensitive. */
    private boolean isOtherName(String raw) {
        if (raw == null) return false;
        String n = raw.trim().toLowerCase(java.util.Locale.forLanguageTag("tr"));
        return n.equals("diğer") || n.equals("diger");
    }

    /**
     * Ledger v2 (Faz A, §3.9): istemci string'ini {@link CategoryApplicability}'ye
     * çevirir. Null/boş/geçersiz değerde {@code fallback} döner (validation
     * yumuşak — STRICT kilit yalnız geçerli değerle uygulanır).
     */
    private CategoryApplicability parseApplicability(String raw, CategoryApplicability fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            return CategoryApplicability.valueOf(raw.trim().toUpperCase(java.util.Locale.ENGLISH));
        } catch (IllegalArgumentException e) {
            log.warn("[category] gecersiz applicability='{}' — fallback={}", raw, fallback);
            return fallback;
        }
    }

    private void recordAudit(String action, UUID userId, UUID businessId,
                             String businessName, Category category, String detail) {
        User user = userRepository.findById(userId).orElse(null);
        auditLogService.recordEntityAction(
                action,
                userId, user != null ? user.getUsername() : null,
                "CATEGORY", category.getId(),
                detail,
                Map.of(
                        "businessId", businessId,
                        "categoryName", category.getName(),
                        "direction", category.getDirection() != null
                                ? category.getDirection().name() : "SHARED",
                        "applicability", category.getApplicability() != null
                                ? category.getApplicability().name() : "BOTH",
                        "active", category.isActive()
                ));
    }
}
