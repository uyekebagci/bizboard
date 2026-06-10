package com.bizboard.repository;

import com.bizboard.common.entity.Category;
import com.bizboard.common.enums.TransactionDirection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CategoryRepository extends JpaRepository<Category, UUID> {

    List<Category> findByBusinessIdAndActiveTrueOrderBySortOrder(UUID businessId);

    /**
     * Paylaşımlı kategori modeli: aynı business içinde aktif isim çakışması
     * kontrolü (case-insensitive, yön-bağımsız). Boş ise yeni isim serbest.
     */
    Optional<Category> findFirstByBusinessIdAndNameIgnoreCaseAndActiveTrue(
            UUID businessId, String name);

    /**
     * Kategori CRUD (cat-be WP, legacy): aynı business+direction içinde aktif isim
     * çakışması kontrolü (case-insensitive). Paylaşımlı modele geçişte artık
     * kullanılmaz; geriye dönük referanslar için korunur.
     */
    Optional<Category> findFirstByBusinessIdAndDirectionAndNameIgnoreCaseAndActiveTrue(
            UUID businessId, TransactionDirection direction, String name);

    /**
     * "Diğer" backfill kategorisi lookup — her business+direction için tek
     * seferlik idempotent oluşturma kontrolünde kullanılır (aktif/pasif tümü).
     */
    Optional<Category> findFirstByBusinessIdAndDirectionAndNameIgnoreCase(
            UUID businessId, TransactionDirection direction, String name);
}
