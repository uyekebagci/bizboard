package com.bizboard.repository;

import com.bizboard.common.entity.CashClosing;
import com.bizboard.common.enums.CashClosingStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * v1.6.18 (WP-1): Günlük kasa kapanışı repository.
 */
public interface CashClosingRepository extends JpaRepository<CashClosing, UUID> {

    // Legacy single-tenant — yalnız global cron'da fallback için tutuluyor;
    // yeni kod aşağıdaki business-scoped varyantları kullanmalı.
    Optional<CashClosing> findByClosingDate(LocalDate date);

    List<CashClosing> findByStatusOrderByClosingDateDesc(CashClosingStatus status);

    List<CashClosing> findByClosingDateBetweenOrderByClosingDateAsc(LocalDate from, LocalDate to);

    /** En son kapanış kaydı (tek-tenant fallback). */
    Optional<CashClosing> findFirstByOrderByClosingDateDesc();

    // ── v1.6.23.21 (Security WP / arch-rules §1.1): business-scoped ──────────

    Optional<CashClosing> findByBusinessIdAndClosingDate(UUID businessId, LocalDate date);

    List<CashClosing> findByBusinessIdAndStatusOrderByClosingDateDesc(
            UUID businessId, CashClosingStatus status);

    List<CashClosing> findByBusinessIdAndClosingDateBetweenOrderByClosingDateAsc(
            UUID businessId, LocalDate from, LocalDate to);

    Optional<CashClosing> findFirstByBusinessIdOrderByClosingDateDesc(UUID businessId);
}
