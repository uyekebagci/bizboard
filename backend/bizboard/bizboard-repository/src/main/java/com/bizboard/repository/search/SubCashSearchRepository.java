package com.bizboard.repository.search;

import com.bizboard.common.entity.BankAccount;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * v2.2.0 — SubCash (alt kasa) FTS (spec §4, v1.7+).
 *
 * <p>Alt kasa = {@code bank_accounts} satırı, {@code type = SUB_CASH}. UI'da ayrı
 * kategori olduğu için ayrı strategy/tip; BankAccount strategy SUB_CASH'i hariç
 * tutar (duplicate yok). Tenant-scope: {@code business.id IN :businessIds} (L3).</p>
 */
public interface SubCashSearchRepository extends JpaRepository<BankAccount, UUID> {

    @Query("""
            SELECT b FROM BankAccount b
            WHERE b.business.id IN :businessIds
              AND b.type = com.bizboard.common.enums.BankAccountType.SUB_CASH
              AND ( :hasText = false OR LOWER(b.name) LIKE :term )
            ORDER BY b.name ASC
            """)
    List<BankAccount> search(
            @Param("businessIds") List<UUID> businessIds,
            @Param("hasText") boolean hasText,
            @Param("term") String term,
            Pageable page);

    @Query("""
            SELECT b FROM BankAccount b
            WHERE b.business.id IN :businessIds
              AND b.type = com.bizboard.common.enums.BankAccountType.SUB_CASH
              AND LOWER(b.name) LIKE :prefix
            ORDER BY b.name ASC
            """)
    List<BankAccount> suggest(
            @Param("businessIds") List<UUID> businessIds,
            @Param("prefix") String prefix,
            Pageable page);
}
