package com.bizboard.repository;

import com.bizboard.common.entity.SubCashAssignment;
import com.bizboard.common.enums.SubCashEntityType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * v1.6.23.27 (UI Fix WP TODO fbf92aa9): Sub-Cash Aggregator atama
 * repository.
 */
public interface SubCashAssignmentRepository extends JpaRepository<SubCashAssignment, UUID> {

    /** Bir entity'nin mevcut atamasını bul — UNIQUE constraint nedeniyle 0 veya 1. */
    Optional<SubCashAssignment> findByEntityTypeAndEntityId(SubCashEntityType type, UUID entityId);

    /** Belirli sub-cash'in tüm atamaları. */
    List<SubCashAssignment> findBySubCashIdOrderByAssignedAtDesc(UUID subCashId);

    /** Belirli business'ın tüm atamaları (UI bulk view + invariant check). */
    List<SubCashAssignment> findByBusinessIdOrderByAssignedAtDesc(UUID businessId);

    /** Bir business'ta belirli tipte tüm atamalar — assignment-aware list filter. */
    List<SubCashAssignment> findByBusinessIdAndEntityTypeOrderByAssignedAtDesc(
            UUID businessId, SubCashEntityType type);

    long countBySubCashId(UUID subCashId);
}
