package com.bizboard.repository;

import com.bizboard.common.entity.PosDevice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * v1.6.18 (WP-1): POS device repository.
 */
public interface PosDeviceRepository extends JpaRepository<PosDevice, UUID> {

    List<PosDevice> findByActiveTrueOrderByNameAsc();

    List<PosDevice> findAllByOrderByActiveDescNameAsc();

    // v1.6.23.20 (Security WP TODO 15b1dd12 / arch-rules §1.1): multi-tenant.
    List<PosDevice> findByActiveTrueAndBusinessIdInOrderByNameAsc(List<UUID> businessIds);
    List<PosDevice> findByBusinessIdInOrderByActiveDescNameAsc(List<UUID> businessIds);

    long countByOwnerCounterpartId(UUID counterpartId);
}
