package com.bizboard.repository;

import com.bizboard.common.entity.CategoryLearningRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.8): karşı-taraf → kategori öğrenme kuralları.
 */
public interface CategoryLearningRuleRepository
        extends JpaRepository<CategoryLearningRule, UUID> {

    Optional<CategoryLearningRule> findByBusinessIdAndCounterpartPattern(
            UUID businessId, String counterpartPattern);
}
