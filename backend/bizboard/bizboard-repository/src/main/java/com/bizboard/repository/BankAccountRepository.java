package com.bizboard.repository;

import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.enums.BankAccountType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * v1.6.18 (WP-1): BankAccount repository.
 *
 * <p>Default sorgular aktiflere göre filtreli — pasif hesaplar yalnız
 * explicit `IncludingInactive` varyantları ile gelir.</p>
 */
public interface BankAccountRepository extends JpaRepository<BankAccount, UUID> {

    /** Aktif hesaplar — varsayılan listeleme. */
    List<BankAccount> findByActiveTrueOrderByNameAsc();

    /** Aktif hesaplar belirli tip(ler) için. */
    List<BankAccount> findByActiveTrueAndTypeOrderByNameAsc(BankAccountType type);

    /** Tüm hesaplar (toggle ile pasifler de). */
    List<BankAccount> findAllByOrderByActiveDescNameAsc();

    /** Bir person counterpart'a bağlı kasa hesabı var mı (delete guard). */
    long countByHolderPersonId(UUID counterpartId);

    // v1.6.23.19 (Security WP TODO 809834ef): business-scoped queries.
    List<BankAccount> findByActiveTrueAndBusinessIdInOrderByNameAsc(List<UUID> businessIds);
    List<BankAccount> findByBusinessIdInOrderByActiveDescNameAsc(List<UUID> businessIds);
}
