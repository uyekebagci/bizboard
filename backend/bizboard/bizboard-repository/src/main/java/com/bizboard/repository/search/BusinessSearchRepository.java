package com.bizboard.repository.search;

import com.bizboard.common.entity.Business;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — Business (işletme) FTS (spec §4).
 *
 * <p><b>Erişim:</b> Business tenant'ın kendisidir; scope {@code id IN
 * :businessIds} (kullanıcının erişebildiği işletmeler). Aranabilir: name,
 * business_type_name.</p>
 */
public interface BusinessSearchRepository extends JpaRepository<Business, UUID> {

    @Query("""
            SELECT b FROM Business b
            WHERE b.id IN :businessIds
              AND ( :hasText = false
                    OR LOWER(b.name) LIKE :term
                    OR LOWER(COALESCE(b.businessTypeName, '')) LIKE :term )
            ORDER BY b.name ASC
            """)
    List<Business> search(
            @Param("businessIds") List<UUID> businessIds,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            Pageable page);

    @Query("""
            SELECT b FROM Business b
            WHERE b.id IN :businessIds
              AND LOWER(b.name) LIKE :prefix
            ORDER BY b.name ASC
            """)
    List<Business> suggest(
            @Param("businessIds") List<UUID> businessIds,
            @Param("prefix") String prefix,
            Pageable page);
}
