package com.bizboard.repository;

import com.bizboard.common.entity.DayCloseEditRequest;
import com.bizboard.common.enums.DayCloseEditStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §4.2): onaylı gün-kapanışı düzenleme istekleri.
 */
public interface DayCloseEditRequestRepository
        extends JpaRepository<DayCloseEditRequest, UUID> {

    List<DayCloseEditRequest> findByBusinessIdOrderByRequestedAtDesc(UUID businessId);

    List<DayCloseEditRequest> findByBusinessIdAndStatusOrderByRequestedAtDesc(
            UUID businessId, DayCloseEditStatus status);

    List<DayCloseEditRequest> findByDayCloseIdOrderByRequestedAtDesc(UUID dayCloseId);

    long countByDayCloseIdAndStatus(UUID dayCloseId, DayCloseEditStatus status);
}
