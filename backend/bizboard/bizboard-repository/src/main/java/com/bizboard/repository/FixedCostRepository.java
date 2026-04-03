package com.bizboard.repository;

import com.bizboard.common.entity.FixedCost;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FixedCostRepository extends JpaRepository<FixedCost, UUID> {

    List<FixedCost> findByBusinessIdOrderByCreatedAtDesc(UUID businessId);

    List<FixedCost> findByBusinessIdAndActiveTrueOrderByCreatedAtDesc(UUID businessId);

    List<FixedCost> findByBusinessIdAndTypeOrderByCreatedAtDesc(UUID businessId, String type);

    List<FixedCost> findByBusinessIdIn(List<UUID> businessIds);
}
