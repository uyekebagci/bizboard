package com.bizboard.repository;

import com.bizboard.common.entity.DayOpenAccountOpening;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B — Gün Açılışı): {@link DayOpenAccountOpening} repository.
 */
public interface DayOpenAccountOpeningRepository
        extends JpaRepository<DayOpenAccountOpening, UUID> {

    List<DayOpenAccountOpening> findByDayOpenId(UUID dayOpenId);

    /**
     * Yeniden açılış re-open'da eski açılışları fiziksel siler (orphanRemoval
     * INSERT-before-DELETE unique çakışmasını önlemek için; DayClose'daki
     * clearExistingCounts ile aynı desen).
     */
    @Modifying
    @Query("DELETE FROM DayOpenAccountOpening o WHERE o.dayOpen.id = :dayOpenId")
    void deleteByDayOpenId(@Param("dayOpenId") UUID dayOpenId);
}
