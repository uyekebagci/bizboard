package com.bizboard.repository;

import com.bizboard.common.entity.PaymentInstrument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface PaymentInstrumentRepository extends JpaRepository<PaymentInstrument, UUID> {

    List<PaymentInstrument> findByBusinessIdAndCounterpartIdOrderByDueDateAsc(
            UUID businessId, UUID counterpartId);

    List<PaymentInstrument> findByBusinessIdOrderByDueDateAsc(UUID businessId);

    List<PaymentInstrument> findByBusinessIdAndStatusOrderByDueDateAsc(
            UUID businessId, String status);

    @Query("SELECT p FROM PaymentInstrument p WHERE p.business.id IN :businessIds " +
            "AND p.status = 'PORTFOLIO' AND p.dueDate BETWEEN :from AND :to " +
            "ORDER BY p.dueDate ASC")
    List<PaymentInstrument> findUpcomingPortfolio(
            @Param("businessIds") List<UUID> businessIds,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);
}
