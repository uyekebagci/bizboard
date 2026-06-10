package com.bizboard.repository.search;

import com.bizboard.common.entity.BusinessNote;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — BusinessNote (not) FTS (spec §4).
 *
 * <p>Tenant-scope: {@code business.id IN :businessIds} (L3). <b>Ek güvenlik:</b>
 * {@code admin_only} notlar yalnız admin'e döner ({@code :isAdmin}); normal
 * kullanıcı admin-only notları göremez (mevcut not erişim modeliyle tutarlı).</p>
 */
public interface BusinessNoteSearchRepository extends JpaRepository<BusinessNote, UUID> {

    @Query("""
            SELECT n FROM BusinessNote n
            WHERE n.business.id IN :businessIds
              AND ( :isAdmin = true OR n.adminOnly = false )
              AND ( :hasText = false OR LOWER(n.content) LIKE :term )
            ORDER BY n.pinned DESC, n.createdAt DESC
            """)
    List<BusinessNote> search(
            @Param("businessIds") List<UUID> businessIds,
            @Param("isAdmin") boolean isAdmin,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            Pageable page);

    @Query("""
            SELECT n FROM BusinessNote n
            WHERE n.business.id IN :businessIds
              AND ( :isAdmin = true OR n.adminOnly = false )
              AND LOWER(n.content) LIKE :prefix
            ORDER BY n.createdAt DESC
            """)
    List<BusinessNote> suggest(
            @Param("businessIds") List<UUID> businessIds,
            @Param("isAdmin") boolean isAdmin,
            @Param("prefix") String prefix,
            Pageable page);
}
