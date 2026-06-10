package com.bizboard.repository.search;

import com.bizboard.common.entity.InventoryItem;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — InventoryItem (envanter) FTS (spec §4).
 *
 * <p>Tenant-scope: {@code business.id IN :businessIds} (L3). Aranabilir alanlar:
 * name, sku, serial_number, brand, model. {@code kategori:} → category.</p>
 */
public interface InventoryItemSearchRepository extends JpaRepository<InventoryItem, UUID> {

    @Query("""
            SELECT i FROM InventoryItem i
            WHERE i.business.id IN :businessIds
              AND ( :hasText = false
                    OR LOWER(i.name) LIKE :term
                    OR LOWER(COALESCE(i.sku, '')) LIKE :term
                    OR LOWER(COALESCE(i.serialNumber, '')) LIKE :term
                    OR LOWER(COALESCE(i.brand, '')) LIKE :term
                    OR LOWER(COALESCE(i.model, '')) LIKE :term )
              AND ( :category IS NULL OR LOWER(COALESCE(i.category, '')) LIKE :category )
            ORDER BY i.name ASC
            """)
    List<InventoryItem> search(
            @Param("businessIds") List<UUID> businessIds,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            @Param("category") String category,
            Pageable page);

    @Query("""
            SELECT i FROM InventoryItem i
            WHERE i.business.id IN :businessIds
              AND ( LOWER(i.name) LIKE :prefix OR LOWER(COALESCE(i.sku, '')) LIKE :prefix )
            ORDER BY i.name ASC
            """)
    List<InventoryItem> suggest(
            @Param("businessIds") List<UUID> businessIds,
            @Param("prefix") String prefix,
            Pageable page);
}
