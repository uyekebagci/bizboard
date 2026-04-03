package com.bizboard.repository;

import com.bizboard.common.entity.Vehicle;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface VehicleRepository extends JpaRepository<Vehicle, UUID> {

    List<Vehicle> findByBusinessIdOrderByPlateNumberAsc(UUID businessId);

    List<Vehicle> findByBusinessIdAndActiveTrueOrderByPlateNumberAsc(UUID businessId);

    List<Vehicle> findByBusinessIdIn(List<UUID> businessIds);

    int countByBusinessIdAndActiveTrue(UUID businessId);
}
