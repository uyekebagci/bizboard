package com.bizboard.repository.search;

import com.bizboard.common.entity.PosDevice;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — PosDevice (POS cihazı) FTS (spec §4, v1.7+).
 *
 * <p>Tenant-scope: {@code business.id IN :businessIds} (L3). Aranabilir alanlar:
 * name, bank_name, owner counterpart adı.</p>
 */
public interface PosDeviceSearchRepository extends JpaRepository<PosDevice, UUID> {

    @Query("""
            SELECT p FROM PosDevice p
            LEFT JOIN p.ownerCounterpart oc
            WHERE p.business.id IN :businessIds
              AND ( :hasText = false
                    OR LOWER(p.name) LIKE :term
                    OR LOWER(COALESCE(p.bankName, '')) LIKE :term
                    OR LOWER(COALESCE(oc.name, '')) LIKE :term )
            ORDER BY p.name ASC
            """)
    List<PosDevice> search(
            @Param("businessIds") List<UUID> businessIds,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            Pageable page);

    @Query("""
            SELECT p FROM PosDevice p
            WHERE p.business.id IN :businessIds
              AND LOWER(p.name) LIKE :prefix
            ORDER BY p.name ASC
            """)
    List<PosDevice> suggest(
            @Param("businessIds") List<UUID> businessIds,
            @Param("prefix") String prefix,
            Pageable page);
}
