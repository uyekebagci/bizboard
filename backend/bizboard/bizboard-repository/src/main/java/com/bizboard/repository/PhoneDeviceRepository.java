package com.bizboard.repository;

import com.bizboard.common.entity.PhoneDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface PhoneDeviceRepository extends JpaRepository<PhoneDevice, UUID> {

    List<PhoneDevice> findByBusinessIdOrderByDeviceNumberAsc(UUID businessId);

    List<PhoneDevice> findByBusinessIdAndActiveTrueOrderByDeviceNumberAsc(UUID businessId);

    List<PhoneDevice> findByAssignedCounterpartIdOrderByDeviceNumberAsc(UUID counterpartId);

    @Query("SELECT COALESCE(MAX(p.deviceNumber), 0) FROM PhoneDevice p WHERE p.business.id = :businessId")
    int findMaxDeviceNumberByBusinessId(UUID businessId);

    long countByActiveTrue();
}
