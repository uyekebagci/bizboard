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

    // v1.6.23.7: tarih aralığı (frontend pos-cihazlari sayfası days=30 için).
    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds " +
            "AND t.paymentMethod = :paymentMethod AND t.date BETWEEN :from AND :to " +
            "ORDER BY t.date DESC, t.createdAt DESC")
    List<Transaction> findByBusinessIdInAndPaymentMethodAndDateBetween(
            @Param("businessIds") List<UUID> businessIds,
            @Param("paymentMethod") String paymentMethod,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    /**
     * v1.6.19 (WP-2): Bir takvim günündeki tüm transaction'lar (tek-tenant
     * cash closing hesabı için — business filtresi yok).
     */
    List<Transaction> findByDate(LocalDate date);

    /**
     * v1.6.20 (WP-3): "Hesaptan Harcama" widget — gün + paymentMethod + direction.
     */
    @Query("SELECT t FROM Transaction t " +
            "WHERE t.date = :date " +
            "  AND t.paymentMethod = :paymentMethod " +
            "  AND t.direction = :direction " +
            "ORDER BY t.createdAt DESC")
    List<Transaction> findByDateAndPaymentMethodAndDirection(
            @Param("date") LocalDate date,
            @Param("paymentMethod") String paymentMethod,
            @Param("direction") com.bizboard.common.enums.TransactionDirection direction);

    /** v1.6.20 (WP-3): POS cihazı bazında bugünkü tx'ler. */
    @Query("SELECT t FROM Transaction t " +
            "WHERE t.posDevice.id = :deviceId AND t.date = :date " +
            "ORDER BY t.createdAt DESC")
    List<Transaction> findByPosDeviceIdAndDate(
            @Param("deviceId") UUID deviceId,
            @Param("date") LocalDate date);
}
