package com.bizboard.repository;

import com.bizboard.common.entity.BankImportBatch;
import com.bizboard.common.enums.BankImportBatchStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz B, §3.8): banka import partileri (manuel satır girişi iskeleti).
 */
public interface BankImportBatchRepository extends JpaRepository<BankImportBatch, UUID> {

    List<BankImportBatch> findByBusinessIdOrderByCreatedAtDesc(UUID businessId);

    List<BankImportBatch> findByBusinessIdAndStatusOrderByCreatedAtDesc(
            UUID businessId, BankImportBatchStatus status);
}
