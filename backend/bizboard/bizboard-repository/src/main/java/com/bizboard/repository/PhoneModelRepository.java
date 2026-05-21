package com.bizboard.repository;

import com.bizboard.common.entity.PhoneModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PhoneModelRepository extends JpaRepository<PhoneModel, UUID> {

    Optional<PhoneModel> findByBrandIdAndName(UUID brandId, String name);

    List<PhoneModel> findByBrandIdAndActiveTrueOrderByNameAsc(UUID brandId);

    List<PhoneModel> findByBrandIdOrderByNameAsc(UUID brandId);
}
