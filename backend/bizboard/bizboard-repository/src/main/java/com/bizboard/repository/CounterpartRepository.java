package com.bizboard.repository;

import com.bizboard.common.entity.Counterpart;
import com.bizboard.common.enums.CounterpartRole;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CounterpartRepository extends JpaRepository<Counterpart, UUID> {

    List<Counterpart> findAllByOrderByNameAsc();

    List<Counterpart> findByRoleOrderByNameAsc(CounterpartRole role);

    Optional<Counterpart> findByTaxId(String taxId);

    Optional<Counterpart> findFirstByNameIgnoreCase(String name);
}
