package com.bizboard.repository;

import com.bizboard.common.entity.DayCloseAccountCount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.6): bir gün-kapanışının hesap-bazlı sayım bacakları.
 */
public interface DayCloseAccountCountRepository
        extends JpaRepository<DayCloseAccountCount, UUID> {

    List<DayCloseAccountCount> findByDayCloseId(UUID dayCloseId);

    void deleteByDayCloseId(UUID dayCloseId);
}
