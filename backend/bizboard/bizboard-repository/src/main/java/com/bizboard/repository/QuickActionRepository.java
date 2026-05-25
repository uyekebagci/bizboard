package com.bizboard.repository;

import com.bizboard.common.entity.QuickAction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * WP e4dc5271 (Beta v1.4): Quick Action repository.
 */
public interface QuickActionRepository extends JpaRepository<QuickAction, UUID> {

    /**
     * Spec sort: order_index ASC, last_used_at DESC NULLS LAST. JPQL ile
     * NULLS LAST ifade etmek için custom @Query yerine basit derivation kullanıp
     * service tarafında sort kompozit yapıyoruz.
     */
    List<QuickAction> findByUserIdAndBusinessIdOrderByOrderIndexAscLastUsedAtDesc(
            UUID userId, UUID businessId);

    long countByUserIdAndBusinessId(UUID userId, UUID businessId);

    Optional<QuickAction> findByUserIdAndBusinessIdAndName(UUID userId, UUID businessId, String name);
}
