package com.bizboard.repository;

import com.bizboard.common.entity.InventoryItem;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface InventoryItemRepository extends JpaRepository<InventoryItem, UUID> {

    List<InventoryItem> findByBusinessIdAndActiveTrueOrderByCreatedAtDesc(UUID businessId);

    List<InventoryItem> findByBusinessIdAndCategoryAndActiveTrueOrderByCreatedAtDesc(UUID businessId, String category);

    List<InventoryItem> findByBusinessIdInAndActiveTrueOrderByCreatedAtDesc(List<UUID> businessIds);

    /*
     * PERF (server-pagination, non-breaking): {@code GET /portfolio/inventory} için
     * sayfalı varyantlar. Eski parametresiz {@code findByBusinessIdInActiveTrue...}
     * AYNEN korunur; bunlar yalnız {@code ?page=&size=} geldiğinde kullanılır.
     * Kategori filtresi DB'de (eskiden çağıran tarafta business-başı döngü vardı —
     * tek IN sorgusuna indirilir), sıralama {@code createdAt DESC} (birebir).
     * {@code @EntityGraph(business)} ile {@code toDto}'daki {@code getBusiness().getName()}
     * N+1'i elenir.
     */

    @EntityGraph(attributePaths = {"business"})
    Page<InventoryItem> findByBusinessIdInAndActiveTrueOrderByCreatedAtDesc(
            List<UUID> businessIds, Pageable pageable);

    @EntityGraph(attributePaths = {"business"})
    Page<InventoryItem> findByBusinessIdInAndCategoryAndActiveTrueOrderByCreatedAtDesc(
            List<UUID> businessIds, String category, Pageable pageable);

    long countByBusinessIdAndActiveTrueAndCategory(UUID businessId, String category);

    long countByBusinessIdAndActiveTrueAndStatus(UUID businessId, String status);

    /** WP f4fe6d82: reorder taraması — tüm aktif sarf malzeme (eşik kontrolü serviste). */
    List<InventoryItem> findByActiveTrueAndCategory(String category);

    /** WP f4fe6d82: garanti taraması — garanti bitişi belirli tarihte olan aktif kalemler. */
    List<InventoryItem> findByActiveTrueAndWarrantyExpiry(LocalDate warrantyExpiry);
}
