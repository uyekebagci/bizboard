package com.bizboard.repository;

import com.bizboard.common.entity.Transaction;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface TransactionRepository extends JpaRepository<Transaction, UUID> {

    List<Transaction> findByBusinessIdOrderByDateDesc(UUID businessId, Pageable pageable);

    @Query("SELECT t FROM Transaction t WHERE t.business.id = :businessId " +
            "AND YEAR(t.date) = :year AND MONTH(t.date) = :month ORDER BY t.date DESC")
    List<Transaction> findByBusinessIdAndMonth(
            @Param("businessId") UUID businessId,
            @Param("year") int year,
            @Param("month") int month);

    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds ORDER BY t.createdAt DESC")
    List<Transaction> findByBusinessIdInOrderByCreatedAtDesc(
            @Param("businessIds") List<UUID> businessIds, Pageable pageable);

    // Tüm işlemler (limitsiz, tarih sıralı) - birden fazla işletme
    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds ORDER BY t.date DESC")
    List<Transaction> findByBusinessIdInOrderByDateDesc(@Param("businessIds") List<UUID> businessIds);

    // Tek işletme tüm işlemler
    List<Transaction> findByBusinessIdOrderByDateDesc(UUID businessId);

    // Dinamik tarih aralığı sorgusu - tek işletme
    @Query("SELECT t FROM Transaction t WHERE t.business.id = :businessId " +
            "AND t.date >= :startDate AND t.date <= :endDate ORDER BY t.date DESC")
    List<Transaction> findByBusinessIdAndDateBetween(
            @Param("businessId") UUID businessId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    // Dinamik tarih aralığı sorgusu - birden fazla işletme
    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds " +
            "AND t.date >= :startDate AND t.date <= :endDate ORDER BY t.date DESC")
    List<Transaction> findByBusinessIdInAndDateBetween(
            @Param("businessIds") List<UUID> businessIds,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    // v1.6.3: POS işlemleri — payment_method filtreli
    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds " +
            "AND t.paymentMethod = :paymentMethod ORDER BY t.date DESC, t.createdAt DESC")
    List<Transaction> findByBusinessIdInAndPaymentMethod(
            @Param("businessIds") List<UUID> businessIds,
            @Param("paymentMethod") String paymentMethod);

    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds " +
            "AND t.paymentMethod = :paymentMethod AND t.date = :date " +
            "ORDER BY t.createdAt DESC")
    List<Transaction> findByBusinessIdInAndPaymentMethodAndDate(
            @Param("businessIds") List<UUID> businessIds,
            @Param("paymentMethod") String paymentMethod,
            @Param("date") LocalDate date);
}
