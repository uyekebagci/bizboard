package com.bizboard.repository;

import com.bizboard.common.entity.TaxDeadlineRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Vergi Takvimi Modülü — tekrarlayan vergi son tarih kurallarının erişimi.
 */
public interface TaxDeadlineRuleRepository extends JpaRepository<TaxDeadlineRule, UUID> {

    /** Aktif tüm kurallar (takvim/bildirim üretimi bunlardan beslenir). */
    List<TaxDeadlineRule> findByActiveTrue();

    /** Seed idempotency kontrolü. */
    Optional<TaxDeadlineRule> findBySeedKey(String seedKey);

    boolean existsBySeedKey(String seedKey);
}
