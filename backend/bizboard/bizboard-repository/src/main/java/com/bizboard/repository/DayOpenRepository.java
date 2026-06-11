package com.bizboard.repository;

import com.bizboard.common.entity.DayOpen;
import com.bizboard.common.enums.DayOpenStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Ledger v2 (Faz B — Gün Açılışı): {@link DayOpen} repository — gün AÇILIŞ
 * omurgası (işletme + tarih başına).
 */
public interface DayOpenRepository extends JpaRepository<DayOpen, UUID> {

    Optional<DayOpen> findByBusinessIdAndOpenDate(UUID businessId, LocalDate openDate);

    boolean existsByBusinessIdAndOpenDate(UUID businessId, LocalDate openDate);

    boolean existsByBusinessIdAndOpenDateAndStatus(
            UUID businessId, LocalDate openDate, DayOpenStatus status);

    List<DayOpen> findByBusinessIdOrderByOpenDateDesc(UUID businessId);

    /** Reversible migration: created_via=AUTO/CLOSE_SYNC backfill geri alma. */
    List<DayOpen> findByCreatedVia(com.bizboard.common.enums.DayOpenCreatedVia createdVia);
}
