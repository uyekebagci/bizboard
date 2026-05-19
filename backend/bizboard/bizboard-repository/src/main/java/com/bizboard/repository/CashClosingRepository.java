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

    Optional<CashClosing> findByClosingDate(LocalDate date);

    List<CashClosing> findByStatusOrderByClosingDateDesc(CashClosingStatus status);

    List<CashClosing> findByClosingDateBetweenOrderByClosingDateAsc(LocalDate from, LocalDate to);

    /** En son kapanış kaydı (chain için bir önceki günü çözmekte yardımcı). */
    Optional<CashClosing> findFirstByOrderByClosingDateDesc();
}
