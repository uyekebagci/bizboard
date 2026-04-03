package com.bizboard.repository;

import com.bizboard.common.entity.BusinessModule;
import com.bizboard.common.enums.ModuleType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface BusinessModuleRepository extends JpaRepository<BusinessModule, UUID> {
    Optional<BusinessModule> findByBusinessIdAndModule(UUID businessId, ModuleType module);
}
