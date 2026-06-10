package com.bizboard.repository;

import com.bizboard.common.entity.ProfitShareRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.4): {@link ProfitShareRule} repository — operatör/cihaz
 * başına konfigüre kâr-payı kuralları.
 */
public interface ProfitShareRuleRepository extends JpaRepository<ProfitShareRule, UUID> {

    List<ProfitShareRule> findByBusinessIdAndActiveTrueOrderByPriorityAsc(UUID businessId);

    List<ProfitShareRule> findByBusinessIdOrderByPriorityAsc(UUID businessId);

    long countByBusinessId(UUID businessId);
}
