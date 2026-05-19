package com.bizboard.repository;

import com.bizboard.common.entity.PosDevice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * v1.7.0 (WP-1): POS device repository.
 */
public interface PosDeviceRepository extends JpaRepository<PosDevice, UUID> {

    List<PosDevice> findByActiveTrueOrderByNameAsc();

    List<PosDevice> findAllByOrderByActiveDescNameAsc();

    long countByOwnerCounterpartId(UUID counterpartId);
}
