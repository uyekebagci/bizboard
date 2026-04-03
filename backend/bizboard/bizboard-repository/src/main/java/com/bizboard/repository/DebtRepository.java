package com.bizboard.repository;

import com.bizboard.common.entity.Debt;
import com.bizboard.common.enums.DebtDirection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DebtRepository extends JpaRepository<Debt, UUID> {

    /** Bir işletmenin tüm borçları (admin_only dahil) */
    List<Debt> findByBusinessIdOrderByCreatedAtDesc(UUID businessId);

    /** Bir işletmenin admin_only=false borçları */
    List<Debt> findByBusinessIdAndAdminOnlyFalseOrderByCreatedAtDesc(UUID businessId);

    /** Tüm işletmelerin borçları (admin panel) */
    List<Debt> findAllByOrderByCreatedAtDesc();

    /** Belirli işletmelerin borçları */
    List<Debt> findByBusinessIdInOrderByCreatedAtDesc(List<UUID> businessIds);

    /** Belirli işletmelerin admin_only=false borçları */
    List<Debt> findByBusinessIdInAndAdminOnlyFalseOrderByCreatedAtDesc(List<UUID> businessIds);

    /** Bir işletmenin yönüne göre borçları */
    List<Debt> findByBusinessIdAndDirection(UUID businessId, DebtDirection direction);
}
