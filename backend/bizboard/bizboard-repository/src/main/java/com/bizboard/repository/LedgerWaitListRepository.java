package com.bizboard.repository;

import com.bizboard.common.entity.LedgerWaitListEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface LedgerWaitListRepository extends JpaRepository<LedgerWaitListEntry, UUID> {

    List<LedgerWaitListEntry> findByProcessedFalseOrderByCreatedAtAsc();

    @Query("SELECT DISTINCT e.businessId, e.targetYear, e.targetMonth " +
            "FROM LedgerWaitListEntry e WHERE e.processed = false")
    List<Object[]> findDistinctUnprocessedPeriods();

    long countByProcessedFalse();
}
