package com.bizboard.repository.search;

import com.bizboard.common.entity.Debt;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — Debt (borç/alacak) FTS (spec §4). Tenant-scope: business.id IN (L3).
 * {@code durum:} → status filtresi (OPEN/SETTLED).
 */
public interface DebtSearchRepository extends JpaRepository<Debt, UUID> {

    @Query("""
            SELECT d FROM Debt d
            WHERE d.business.id IN :businessIds
              AND ( :hasText = false
                    OR LOWER(d.counterparty) LIKE :term
                    OR LOWER(COALESCE(d.description, '')) LIKE :term )
              AND ( :minAmount IS NULL OR d.amount >= :minAmount )
              AND ( :maxAmount IS NULL OR d.amount <= :maxAmount )
              AND ( :fromDate IS NULL OR d.dueDate >= :fromDate )
              AND ( :toDate   IS NULL OR d.dueDate <= :toDate )
              AND ( :status   IS NULL OR LOWER(d.status) = :status )
            ORDER BY d.dueDate DESC NULLS LAST, d.createdAt DESC
            """)
    List<Debt> search(
            @Param("businessIds") List<UUID> businessIds,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            @Param("minAmount") BigDecimal minAmount,
            @Param("maxAmount") BigDecimal maxAmount,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate,
            @Param("status") String status,
            Pageable page);

    @Query("""
            SELECT d FROM Debt d
            WHERE d.business.id IN :businessIds
              AND LOWER(d.counterparty) LIKE :prefix
            ORDER BY d.createdAt DESC
            """)
    List<Debt> suggest(
            @Param("businessIds") List<UUID> businessIds,
            @Param("prefix") String prefix,
            Pageable page);
}
