package com.bizboard.repository;

import com.bizboard.common.entity.MaintenanceLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MaintenanceLogRepository extends JpaRepository<MaintenanceLog, UUID> {

    List<MaintenanceLog> findByInventoryItemIdOrderByDateDesc(UUID inventoryItemId);
}
