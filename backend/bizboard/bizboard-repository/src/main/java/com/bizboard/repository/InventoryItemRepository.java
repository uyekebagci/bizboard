package com.bizboard.repository;

import com.bizboard.common.entity.InventoryItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface InventoryItemRepository extends JpaRepository<InventoryItem, UUID> {

    List<InventoryItem> findByBusinessIdAndActiveTrueOrderByCreatedAtDesc(UUID businessId);

    List<InventoryItem> findByBusinessIdAndCategoryAndActiveTrueOrderByCreatedAtDesc(UUID businessId, String category);

    List<InventoryItem> findByBusinessIdInAndActiveTrueOrderByCreatedAtDesc(List<UUID> businessIds);

    long countByBusinessIdAndActiveTrueAndCategory(UUID businessId, String category);

    long countByBusinessIdAndActiveTrueAndStatus(UUID businessId, String status);
}
