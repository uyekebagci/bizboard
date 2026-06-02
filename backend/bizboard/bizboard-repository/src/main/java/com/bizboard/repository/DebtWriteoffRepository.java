package com.bizboard.repository;

import com.bizboard.common.entity.DebtWriteoff;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DebtWriteoffRepository extends JpaRepository<DebtWriteoff, UUID> {

    /** Counterpart cari hesap statement için. */
    List<DebtWriteoff> findByCounterpart_IdOrderByWrittenOffAtDesc(UUID counterpartId);

    /** Bir debt'in tüm writeoff'ları (history). */
    List<DebtWriteoff> findByDebt_IdOrderByWrittenOffAtDesc(UUID debtId);

    /** Business scoped — opsiyonel reporting. */
    List<DebtWriteoff> findByBusiness_IdOrderByWrittenOffAtDesc(UUID businessId);
}
