package com.bizboard.repository.search;

import com.bizboard.common.entity.Vehicle;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — Vehicle (araç) FTS (spec §4).
 *
 * <p>Tenant-scope: {@code business.id IN :businessIds} (L3). Aranabilir alanlar:
 * plate_number, brand, model.</p>
 */
public interface VehicleSearchRepository extends JpaRepository<Vehicle, UUID> {

    @Query("""
            SELECT v FROM Vehicle v
            WHERE v.business.id IN :businessIds
              AND ( :hasText = false
                    OR LOWER(v.plateNumber) LIKE :term
                    OR LOWER(COALESCE(v.brand, '')) LIKE :term
                    OR LOWER(COALESCE(v.model, '')) LIKE :term )
            ORDER BY v.plateNumber ASC
            """)
    List<Vehicle> search(
            @Param("businessIds") List<UUID> businessIds,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            Pageable page);

    @Query("""
            SELECT v FROM Vehicle v
            WHERE v.business.id IN :businessIds
              AND LOWER(v.plateNumber) LIKE :prefix
            ORDER BY v.plateNumber ASC
            """)
    List<Vehicle> suggest(
            @Param("businessIds") List<UUID> businessIds,
            @Param("prefix") String prefix,
            Pageable page);
}
