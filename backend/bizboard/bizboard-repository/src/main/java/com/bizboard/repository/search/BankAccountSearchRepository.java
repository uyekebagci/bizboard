package com.bizboard.repository.search;

import com.bizboard.common.entity.BankAccount;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — BankAccount FTS (spec §4). Hassas: iban (BANK_FULL_VIEW gerekli).
 * Tenant-scope: business.id IN (L3). {@code iban:} ile arama yetki gerektirir;
 * eşleşme dönse de değer maskeli sunulur.
 */
public interface BankAccountSearchRepository extends JpaRepository<BankAccount, UUID> {

    @Query("""
            SELECT b FROM BankAccount b
            WHERE b.business.id IN :businessIds
              AND ( :hasText = false
                    OR LOWER(b.name) LIKE :term
                    OR LOWER(COALESCE(b.bankName, '')) LIKE :term
                    OR LOWER(COALESCE(b.holderName, '')) LIKE :term )
              AND ( :iban IS NULL OR b.iban = :iban )
            ORDER BY b.name ASC
            """)
    List<BankAccount> search(
            @Param("businessIds") List<UUID> businessIds,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            @Param("iban") String iban,
            Pageable page);

    @Query("""
            SELECT b FROM BankAccount b
            WHERE b.business.id IN :businessIds
              AND LOWER(b.name) LIKE :prefix
            ORDER BY b.name ASC
            """)
    List<BankAccount> suggest(
            @Param("businessIds") List<UUID> businessIds,
            @Param("prefix") String prefix,
            Pageable page);
}
