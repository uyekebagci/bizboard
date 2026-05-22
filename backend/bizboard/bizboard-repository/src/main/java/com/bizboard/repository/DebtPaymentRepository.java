package com.bizboard.repository;

import com.bizboard.common.entity.DebtPayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface DebtPaymentRepository extends JpaRepository<DebtPayment, UUID> {

    List<DebtPayment> findByBusinessIdAndCounterpartIdOrderByPaymentDateAscCreatedAtAsc(
            UUID businessId, UUID counterpartId);

    List<DebtPayment> findByDebtId(UUID debtId);

    List<DebtPayment> findByLinkedInstrumentId(UUID instrumentId);
}
