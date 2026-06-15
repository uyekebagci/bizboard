package com.bizboard.repository;

import com.bizboard.common.entity.BankImportLine;
import com.bizboard.common.enums.BankImportLineStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.8): banka import satırları.
 */
public interface BankImportLineRepository extends JpaRepository<BankImportLine, UUID> {

    List<BankImportLine> findByBatchId(UUID batchId);

    List<BankImportLine> findByBatchIdAndStatus(UUID batchId, BankImportLineStatus status);

    long countByBatchIdAndStatus(UUID batchId, BankImportLineStatus status);

    /** PDF import dedupe: aynı parti içinde bu hash zaten var mı? */
    boolean existsByBatchIdAndDedupeHash(UUID batchId, String dedupeHash);

    /** Var olan hash'ler (tek sorguda toplu dedupe için). */
    @org.springframework.data.jpa.repository.Query(
            "select l.dedupeHash from BankImportLine l "
                    + "where l.batch.id = :batchId and l.dedupeHash is not null")
    java.util.Set<String> findDedupeHashesByBatchId(
            @org.springframework.data.repository.query.Param("batchId") UUID batchId);
}
