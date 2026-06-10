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
}
