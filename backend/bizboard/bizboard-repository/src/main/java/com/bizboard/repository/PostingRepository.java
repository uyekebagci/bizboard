package com.bizboard.repository;

import com.bizboard.common.entity.Posting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Ledger v2 (Faz A): {@link Posting} repository — bakiye türetme çekirdeği.
 *
 * <p>Bir hesabın bakiyesi = Σ o hesaba ait posting.amount (işaretli). Bu
 * aggregate sorgular bakiye-posting-türetme servisini ve invariant
 * doğrulamasını besler.</p>
 */
public interface PostingRepository extends JpaRepository<Posting, UUID> {

    /**
     * Bir hesabın posting'lerinden türetilen bakiye (Σ amount). Posting yoksa
     * NULL döner — çağıran ZERO'ya düşürür.
     */
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM Posting p WHERE p.account.id = :accountId")
    BigDecimal sumAmountByAccountId(@Param("accountId") UUID accountId);

    /**
     * Invariant doğrulama: bir entry'nin posting toplamı 0 olmalı. Bu sorgu
     * dengesiz (Σ ≠ 0) entry sayısını verir — backfill sonrası 0 beklenir.
     */
    @Query("SELECT COUNT(e) FROM JournalEntry e WHERE " +
            "(SELECT COALESCE(SUM(p.amount), 0) FROM Posting p WHERE p.journalEntry.id = e.id) <> 0")
    long countUnbalancedEntries();

    long countByJournalEntryId(UUID journalEntryId);
}
