package com.bizboard.repository;

import com.bizboard.common.entity.InventoryItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface InventoryItemRepository extends JpaRepository<InventoryItem, UUID> {

    List<InventoryItem> findByBusinessIdAndActiveTrueOrderByCreatedAtDesc(UUID businessId);

    List<InventoryItem> findByBusinessIdAndCategoryAndActiveTrueOrderByCreatedAtDesc(UUID businessId, String category);

    List<InventoryItem> findByBusinessIdInAndActiveTrueOrderByCreatedAtDesc(List<UUID> businessIds);

    long countByBusinessIdAndActiveTrueAndCategory(UUID businessId, String category);

    long countByBusinessIdAndActiveTrueAndStatus(UUID businessId, String status);

    /** WP f4fe6d82: reorder taraması — tüm aktif sarf malzeme (eşik kontrolü serviste). */
    List<InventoryItem> findByActiveTrueAndCategory(String category);

    /** WP f4fe6d82: garanti taraması — garanti bitişi belirli tarihte olan aktif kalemler. */
    List<InventoryItem> findByActiveTrueAndWarrantyExpiry(LocalDate warrantyExpiry);
}
