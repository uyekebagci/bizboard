package com.bizboard.repository;

import com.bizboard.common.entity.FuelLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FuelLogRepository extends JpaRepository<FuelLog, UUID> {

    List<FuelLog> findByInventoryItemIdOrderByDateDesc(UUID inventoryItemId);
}
