package com.bizboard.repository;

import com.bizboard.common.entity.DayClose;
import com.bizboard.common.enums.DayCloseStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.6): {@link DayClose} repository — gün-kapanışı omurgası.
 */
public interface DayCloseRepository extends JpaRepository<DayClose, UUID> {

    Optional<DayClose> findByBusinessIdAndCloseDate(UUID businessId, LocalDate closeDate);

    boolean existsByBusinessIdAndCloseDate(UUID businessId, LocalDate closeDate);

    List<DayClose> findByBusinessIdOrderByCloseDateDesc(UUID businessId);

    List<DayClose> findByBusinessIdAndStatusOrderByCloseDateDesc(
            UUID businessId, DayCloseStatus status);

    /** Devir zinciri: bir tarihten itibaren (dahil) ileri günler, artan sırada. */
    List<DayClose> findByBusinessIdAndCloseDateGreaterThanEqualOrderByCloseDateAsc(
            UUID businessId, LocalDate from);

    /** Zincir aralığı [from, to] artan sırada (recompute penceresi). */
    List<DayClose> findByBusinessIdAndCloseDateBetweenOrderByCloseDateAsc(
            UUID businessId, LocalDate from, LocalDate to);

    /** En son CLOSED kapanış (opening fallback için). */
    Optional<DayClose> findFirstByBusinessIdAndStatusAndCloseDateLessThanOrderByCloseDateDesc(
            UUID businessId, DayCloseStatus status, LocalDate before);

    /** En son kapanış (herhangi durum). */
    Optional<DayClose> findFirstByBusinessIdOrderByCloseDateDesc(UUID businessId);
}
