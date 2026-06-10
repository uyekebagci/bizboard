package com.bizboard.repository.search;

import com.bizboard.common.entity.Transaction;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 Advanced Search — Transaction FTS (spec §4, §6).
 *
 * <p><b>Güvenlik (L3 mandatory filter, T1):</b> her sorgu zorunlu
 * {@code business.id IN :businessIds} ile sınırlıdır. {@code businessIds} boşsa
 * sonuç dönmez. Tüm değerler parametreli ({@code :param}) — string interpolation
 * YOK (T5). Text match {@code LOWER(col) LIKE :term} ile case-insensitive ve
 * index-dostu.</p>
 */
public interface TransactionSearchRepository extends JpaRepository<Transaction, UUID> {

    @Query("""
            SELECT t FROM Transaction t
            LEFT JOIN t.category c
            WHERE t.business.id IN :businessIds
              AND ( :hasText = false
                    OR LOWER(t.description) LIKE :term
                    OR LOWER(COALESCE(c.name, '')) LIKE :term )
              AND ( :minAmount IS NULL OR t.amount >= :minAmount )
              AND ( :maxAmount IS NULL OR t.amount <= :maxAmount )
              AND ( :fromDate IS NULL OR t.date >= :fromDate )
              AND ( :toDate   IS NULL OR t.date <= :toDate )
              AND ( :category IS NULL OR LOWER(COALESCE(c.name, '')) LIKE :category )
            ORDER BY t.date DESC, t.createdAt DESC
            """)
    List<Transaction> search(
            @Param("businessIds") List<UUID> businessIds,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            @Param("minAmount") BigDecimal minAmount,
            @Param("maxAmount") BigDecimal maxAmount,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate,
            @Param("category") String category,
            Pageable page);

    @Query("""
            SELECT t FROM Transaction t
            WHERE t.business.id IN :businessIds
              AND LOWER(t.description) LIKE :prefix
            ORDER BY t.date DESC
            """)
    List<Transaction> suggest(
            @Param("businessIds") List<UUID> businessIds,
            @Param("prefix") String prefix,
            Pageable page);
}
