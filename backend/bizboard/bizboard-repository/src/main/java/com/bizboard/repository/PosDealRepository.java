package com.bizboard.repository;

import com.bizboard.common.entity.PosDeal;
import com.bizboard.common.enums.PosDealStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.5): {@link PosDeal} repository — POS işlem girişi +
 * kâr-payı şelalesi + T+1 settlement sorguları.
 */
public interface PosDealRepository extends JpaRepository<PosDeal, UUID> {

    List<PosDeal> findByBusinessIdOrderByDealDateDescCreatedAtDesc(UUID businessId);

    List<PosDeal> findByBusinessIdAndDealDateOrderByCreatedAtAsc(UUID businessId, LocalDate dealDate);

    /** Bir gün + cihazdaki tüm deal'ler (settlement batch için brüt toplama + finalize). */
    List<PosDeal> findByBusinessIdAndPosDeviceIdAndDealDate(
            UUID businessId, UUID posDeviceId, LocalDate dealDate);

    List<PosDeal> findBySettlementBatchId(UUID settlementBatchId);

    /** Bir gün + cihazdaki POS brüt toplamı (ort.komisyon paydası). */
    @Query("SELECT COALESCE(SUM(d.grossAmount), 0) FROM PosDeal d " +
            "WHERE d.business.id = :businessId AND d.posDevice.id = :deviceId " +
            "AND d.dealDate = :date AND d.status <> com.bizboard.common.enums.PosDealStatus.REVERSED")
    BigDecimal sumGrossForDeviceDay(@Param("businessId") UUID businessId,
                                    @Param("deviceId") UUID deviceId,
                                    @Param("date") LocalDate date);

    /** Bir işletmede henüz settle olmamış (PROVISIONAL) deal'ler — "yatış bekliyor". */
    List<PosDeal> findByBusinessIdAndStatus(UUID businessId, PosDealStatus status);

    /**
     * Bir gün + cihazda settle bekleyen (PROVISIONAL, batch'siz) cihaz-gün
     * çiftleri için ayrı sorgu yerine: PROVISIONAL deal listesinden grupla.
     */
    @Query("SELECT d FROM PosDeal d " +
            "WHERE d.business.id = :businessId " +
            "AND d.status = com.bizboard.common.enums.PosDealStatus.PROVISIONAL " +
            "ORDER BY d.dealDate ASC")
    List<PosDeal> findPendingSettlement(@Param("businessId") UUID businessId);
}
