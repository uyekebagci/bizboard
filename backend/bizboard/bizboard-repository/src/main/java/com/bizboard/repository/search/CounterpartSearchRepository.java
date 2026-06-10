package com.bizboard.repository.search;

import com.bizboard.common.entity.Counterpart;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — Counterpart (cari/karşı firma) FTS. Hassas: tax_id (spec §4).
 *
 * <p>Tenant-scope: {@code business.id IN :businessIds} (L3). {@code taxId} ile
 * arama yetki gerektirir; eşleşme dönse bile değer maskeli sunulur — yetki ipucu
 * sızmaz (spec §14.2 field-based bypass).</p>
 */
public interface CounterpartSearchRepository extends JpaRepository<Counterpart, UUID> {

    @Query("""
            SELECT c FROM Counterpart c
            WHERE c.business.id IN :businessIds
              AND ( :hasText = false
                    OR LOWER(c.name) LIKE :term
                    OR LOWER(COALESCE(c.contactName, '')) LIKE :term
                    OR LOWER(COALESCE(c.contactPhone, '')) LIKE :term
                    OR LOWER(COALESCE(c.contactEmail, '')) LIKE :term )
              AND ( :taxId IS NULL OR c.taxId = :taxId )
            ORDER BY c.name ASC
            """)
    List<Counterpart> search(
            @Param("businessIds") List<UUID> businessIds,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            @Param("taxId") String taxId,
            Pageable page);

    @Query("""
            SELECT c FROM Counterpart c
            WHERE c.business.id IN :businessIds
              AND LOWER(c.name) LIKE :prefix
            ORDER BY c.name ASC
            """)
    List<Counterpart> suggest(
            @Param("businessIds") List<UUID> businessIds,
            @Param("prefix") String prefix,
            Pageable page);
}
