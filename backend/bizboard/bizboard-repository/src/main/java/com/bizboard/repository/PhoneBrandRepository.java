package com.bizboard.repository;

import com.bizboard.common.entity.PhoneBrand;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PhoneBrandRepository extends JpaRepository<PhoneBrand, UUID> {

    Optional<PhoneBrand> findByName(String name);

    List<PhoneBrand> findByActiveTrueOrderBySortOrderAscNameAsc();

    List<PhoneBrand> findAllByOrderBySortOrderAscNameAsc();
}
