package com.bizboard.repository.search;

import com.bizboard.common.entity.MyCompany;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — MyCompany (firmam) FTS (spec §4). Hassas: tax_id, mersis_no.
 *
 * <p><b>Erişim modeli farkı:</b> MyCompany'nin direkt business_id'si yoktur;
 * erişim {@code my_company_user_access} tablosu üzerindendir. Bu yüzden
 * tenant-scope {@code id IN :companyIds} ile uygulanır (admin tüm firmaları
 * görür → ayrı sorgu).</p>
 */
public interface MyCompanySearchRepository extends JpaRepository<MyCompany, UUID> {

    @Query("""
            SELECT m FROM MyCompany m
            WHERE m.id IN :companyIds
              AND ( :hasText = false
                    OR LOWER(m.legalName) LIKE :term
                    OR LOWER(COALESCE(m.tradeRegistryNo, '')) LIKE :term )
              AND ( :taxId IS NULL OR m.taxId = :taxId )
            ORDER BY m.legalName ASC
            """)
    List<MyCompany> searchScoped(
            @Param("companyIds") List<UUID> companyIds,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            @Param("taxId") String taxId,
            Pageable page);

    @Query("""
            SELECT m FROM MyCompany m
            WHERE ( :hasText = false
                    OR LOWER(m.legalName) LIKE :term
                    OR LOWER(COALESCE(m.tradeRegistryNo, '')) LIKE :term )
              AND ( :taxId IS NULL OR m.taxId = :taxId )
            ORDER BY m.legalName ASC
            """)
    List<MyCompany> searchAll(
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            @Param("taxId") String taxId,
            Pageable page);
}
