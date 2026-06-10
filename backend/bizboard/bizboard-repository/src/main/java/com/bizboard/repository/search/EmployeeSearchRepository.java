package com.bizboard.repository.search;

import com.bizboard.common.entity.Employee;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — Employee FTS (spec §4). Hassas: salary (maaş — HR_FULL_VIEW gerekli).
 * Tenant-scope: business.id IN (L3). Maaş ASLA WHERE'de aranmaz, yalnız maskeli
 * sunulur.
 */
public interface EmployeeSearchRepository extends JpaRepository<Employee, UUID> {

    @Query("""
            SELECT e FROM Employee e
            WHERE e.business.id IN :businessIds
              AND ( :hasText = false
                    OR LOWER(e.fullName) LIKE :term
                    OR LOWER(COALESCE(e.position, '')) LIKE :term )
            ORDER BY e.fullName ASC
            """)
    List<Employee> search(
            @Param("businessIds") List<UUID> businessIds,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            Pageable page);

    @Query("""
            SELECT e FROM Employee e
            WHERE e.business.id IN :businessIds
              AND LOWER(e.fullName) LIKE :prefix
            ORDER BY e.fullName ASC
            """)
    List<Employee> suggest(
            @Param("businessIds") List<UUID> businessIds,
            @Param("prefix") String prefix,
            Pageable page);
}
