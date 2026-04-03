package com.bizboard.repository;

import com.bizboard.common.entity.DeletedTransactionLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DeletedTransactionLogRepository extends JpaRepository<DeletedTransactionLog, UUID> {

    List<DeletedTransactionLog> findByBusinessIdOrderByDeletedAtDesc(UUID businessId, Pageable pageable);

    List<DeletedTransactionLog> findAllByOrderByDeletedAtDesc(Pageable pageable);
}
