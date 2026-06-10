package com.bizboard.service;

import com.bizboard.common.audit.AuditAction;
import com.bizboard.common.dto.CategoryDto;
import com.bizboard.common.dto.CreateCategoryRequest;
import com.bizboard.common.dto.UpdateCategoryRequest;
import com.bizboard.common.entity.Business;
import com.bizboard.common.entity.Category;
import com.bizboard.common.entity.User;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.CategoryRepository;
import com.bizboard.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * cat-be WP: gelir/gider kategori CRUD. Kategoriler per-business + per-direction
 * (INCOME/EXPENSE); gelir ve gider ayrı korunur, gider simetrik. Erişim
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
    private final BusinessAccessGuard accessGuard;
    private final AuditLogService auditLogService;

    @Transactional
    public CategoryDto createCategory(UUID businessId, CreateCategoryRequest request, UUID userId) {
        Business business = businessRepository.findById(businessId)
                .orElseThrow(() -> new IllegalArgumentException("Business not found"));

        accessGuard.assertCanAccessBusiness(userId, businessId);

        String name = request.getName() != null ? request.getName().trim() : "";
        if (name.isEmpty()) {
            throw new IllegalArgumentException("Kategori adi zorunlu");
        }
        TransactionDirection direction = parseDirection(request.getDirection());

        // Aynı business+direction içinde aktif isim çakışmasını engelle.
        categoryRepository.findFirstByBusinessIdAndDirectionAndNameIgnoreCaseAndActiveTrue(
                businessId, direction, name).ifPresent(existing -> {
            throw new IllegalArgumentException(
                    "Bu yonde ayni isimde bir kategori zaten var: " + name);
        });

        Category category = Category.builder()
                .business(business)
                .name(name)
                .direction(direction)
                .icon(request.getIcon())
                .color(request.getColor())
                .sortOrder(request.getSortOrder() != null ? request.getSortOrder() : 0)
                .active(true)
                .build();

        category = categoryRepository.save(category);

        recordAudit(AuditAction.CATEGORY_CREATE, userId, businessId, business.getName(), category,
                business.getName() + " — kategori olusturuldu: " + category.getName()
                        + " (" + direction.name() + ")");

        return DtoMapper.toCategoryDto(category);
    }

    @Transactional
    public CategoryDto updateCategory(UUID categoryId, UpdateCategoryRequest request, UUID userId) {
        Category category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new IllegalArgumentException("Kategori bulunamadi"));

        Business business = category.getBusiness();
        accessGuard.assertCanAccessBusiness(userId, business.getId());

        if (request.getName() != null) {
            String newName = request.getName().trim();
            if (newName.isEmpty()) {
                throw new IllegalArgumentException("Kategori adi bos olamaz");
            }
            // Yeni isim aynı business+direction içinde başka aktif kategoriyle çakışmasın.
            if (!newName.equalsIgnoreCase(category.getName())) {
                categoryRepository.findFirstByBusinessIdAndDirectionAndNameIgnoreCaseAndActiveTrue(
                        business.getId(), category.getDirection(), newName).ifPresent(existing -> {
                    throw new IllegalArgumentException(
                            "Bu yonde ayni isimde bir kategori zaten var: " + newName);
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

        if (!category.isActive()) {
            // Idempotent: zaten pasif — no-op.
            return;
        }
        category.setActive(false);
        categoryRepository.save(category);

        recordAudit(AuditAction.CATEGORY_DELETE, userId, business.getId(), business.getName(), category,
                business.getName() + " — kategori pasiflestirildi (soft-delete): " + category.getName());
    }

    // ───────── helpers ─────────

    static TransactionDirection parseDirection(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("direction zorunlu (INCOME veya EXPENSE)");
        }
        try {
            return TransactionDirection.valueOf(raw.trim().toUpperCase(Locale.ENGLISH));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                    "Gecersiz direction: '" + raw + "' (INCOME veya EXPENSE olmali)");
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
                        "direction", category.getDirection().name(),
                        "active", category.isActive()
                ));
    }
}
