package com.bizboard.repository;

import com.bizboard.common.entity.ClosedPeriodSummary;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ClosedPeriodSummaryRepository extends JpaRepository<ClosedPeriodSummary, UUID> {

    Optional<ClosedPeriodSummary> findByBusinessIdAndYearAndMonth(UUID businessId, int year, int month);

    List<ClosedPeriodSummary> findByBusinessIdInAndYearAndMonth(List<UUID> businessIds, int year, int month);

    boolean existsByBusinessIdAndYearAndMonth(UUID businessId, int year, int month);
}
