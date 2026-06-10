package com.bizboard.repository.search;

import com.bizboard.common.entity.BusinessGroup;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — FirmGroup (firma grubu) FTS (spec §4, v1.7+).
 *
 * <p><b>Erişim modeli farkı:</b> {@code business_groups} kullanıcıya bağlıdır
 * ({@code user_id}); her kullanıcı yalnız kendi gruplarını görür. Bu yüzden
 * tenant filtresi {@code user.id = :userId} (doğal izolasyon — cross-user leak
 * imkansız). Aranabilir: name.</p>
 */
public interface FirmGroupSearchRepository extends JpaRepository<BusinessGroup, UUID> {

    @Query("""
            SELECT g FROM BusinessGroup g
            WHERE g.user.id = :userId
              AND ( :hasText = false OR LOWER(g.name) LIKE :term )
            ORDER BY g.name ASC
            """)
    List<BusinessGroup> search(
            @Param("userId") UUID userId,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            Pageable page);

    @Query("""
            SELECT g FROM BusinessGroup g
            WHERE g.user.id = :userId
              AND LOWER(g.name) LIKE :prefix
            ORDER BY g.name ASC
            """)
    List<BusinessGroup> suggest(
            @Param("userId") UUID userId,
            @Param("prefix") String prefix,
            Pageable page);
}
