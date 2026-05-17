package com.bizboard.repository;

import com.bizboard.common.entity.BusinessTypeDefaultCost;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface BusinessTypeDefaultCostRepository extends JpaRepository<BusinessTypeDefaultCost, UUID> {

    /** Bir business type'a bağlı tüm default cost şablonları, sıralı. */
    List<BusinessTypeDefaultCost> findByBusinessTypeIdOrderBySortOrderAscNameAsc(UUID businessTypeId);

    /** Setup / recurring filtreli. */
    List<BusinessTypeDefaultCost> findByBusinessTypeIdAndSetupOrderBySortOrderAscNameAsc(UUID businessTypeId, boolean setup);
}
