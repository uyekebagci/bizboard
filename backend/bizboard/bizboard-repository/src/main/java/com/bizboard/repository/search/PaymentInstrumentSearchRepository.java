package com.bizboard.repository.search;

import com.bizboard.common.entity.PaymentInstrument;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — PaymentInstrument (çek/senet) FTS (spec §4, v1.7+).
 *
 * <p>Tenant-scope: {@code business.id IN :businessIds} (L3). Aranabilir alanlar:
 * counterpart adı, cheque_number, drawer_bank, drawer_branch, note_serial,
 * description. {@code durum:} → status; tutar/tarih aralığı (due_date).</p>
 */
public interface PaymentInstrumentSearchRepository extends JpaRepository<PaymentInstrument, UUID> {

    @Query("""
            SELECT pi FROM PaymentInstrument pi
            LEFT JOIN pi.counterpart cp
            WHERE pi.business.id IN :businessIds
              AND ( :hasText = false
                    OR LOWER(COALESCE(cp.name, '')) LIKE :term
                    OR LOWER(COALESCE(pi.chequeNumber, '')) LIKE :term
                    OR LOWER(COALESCE(pi.drawerBank, '')) LIKE :term
                    OR LOWER(COALESCE(pi.drawerBranch, '')) LIKE :term
                    OR LOWER(COALESCE(pi.noteSerial, '')) LIKE :term
                    OR LOWER(COALESCE(pi.description, '')) LIKE :term )
              AND ( :minAmount IS NULL OR pi.amount >= :minAmount )
              AND ( :maxAmount IS NULL OR pi.amount <= :maxAmount )
              AND ( :fromDate IS NULL OR pi.dueDate >= :fromDate )
              AND ( :toDate   IS NULL OR pi.dueDate <= :toDate )
              AND ( :status   IS NULL OR LOWER(pi.status) = :status )
            ORDER BY pi.dueDate DESC NULLS LAST
            """)
    List<PaymentInstrument> search(
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
            SELECT pi FROM PaymentInstrument pi
            LEFT JOIN pi.counterpart cp
            WHERE pi.business.id IN :businessIds
              AND ( LOWER(COALESCE(cp.name, '')) LIKE :prefix
                    OR LOWER(COALESCE(pi.chequeNumber, '')) LIKE :prefix )
            ORDER BY pi.dueDate DESC NULLS LAST
            """)
    List<PaymentInstrument> suggest(
            @Param("businessIds") List<UUID> businessIds,
            @Param("prefix") String prefix,
            Pageable page);
}
