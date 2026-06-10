package com.bizboard.repository.search;

import com.bizboard.common.entity.FixedCost;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — FixedCost (sabit gider) FTS (spec §4).
 *
 * <p>Tenant-scope: {@code business.id IN :businessIds} (L3). Aranabilir: name
 * (label), type (category). Tutar aralığı desteklenir.</p>
 */
public interface FixedCostSearchRepository extends JpaRepository<FixedCost, UUID> {

    @Query("""
            SELECT f FROM FixedCost f
            WHERE f.business.id IN :businessIds
              AND ( :hasText = false
                    OR LOWER(f.name) LIKE :term
                    OR LOWER(COALESCE(f.type, '')) LIKE :term )
              AND ( :minAmount IS NULL OR f.amount >= :minAmount )
              AND ( :maxAmount IS NULL OR f.amount <= :maxAmount )
              AND ( :category IS NULL OR LOWER(COALESCE(f.type, '')) LIKE :category )
            ORDER BY f.name ASC
            """)
    List<FixedCost> search(
            @Param("businessIds") List<UUID> businessIds,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            @Param("minAmount") BigDecimal minAmount,
            @Param("maxAmount") BigDecimal maxAmount,
            @Param("category") String category,
            Pageable page);

    @Query("""
            SELECT f FROM FixedCost f
            WHERE f.business.id IN :businessIds
              AND LOWER(f.name) LIKE :prefix
            ORDER BY f.name ASC
            """)
    List<FixedCost> suggest(
            @Param("businessIds") List<UUID> businessIds,
            @Param("prefix") String prefix,
            Pageable page);
}
