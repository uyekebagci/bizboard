package com.bizboard.repository;

import com.bizboard.common.entity.PosSettlementBatch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.5): {@link PosSettlementBatch} repository — gün+cihaz
 * bazlı T+1 ortalama komisyon yatış kayıtları.
 */
public interface PosSettlementBatchRepository extends JpaRepository<PosSettlementBatch, UUID> {

    /** Idempotent finalize anahtarı: bir gün + cihaz için tek batch. */
    Optional<PosSettlementBatch> findByBusinessIdAndSettleDateAndPosDeviceId(
            UUID businessId, LocalDate settleDate, UUID posDeviceId);

    List<PosSettlementBatch> findByBusinessIdOrderBySettleDateDesc(UUID businessId);

    /** Bir günde henüz finalize edilmemiş (yatış bekleyen) batch'ler. */
    List<PosSettlementBatch> findByBusinessIdAndFinalizedFalse(UUID businessId);
}
