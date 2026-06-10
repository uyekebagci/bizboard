package com.bizboard.repository;

import com.bizboard.common.entity.Posting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
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

    // ───────── Ledger v2 (Faz B): gün-kapanışı / SAĞLAMA HESAP zinciri ─────────

    /**
     * Bir hesabın belirli bir tarihe KADAR (dahil) türetilen bakiyesi
     * (Σ amount, entry_date ≤ asOf). Drill-down ve geçmiş gün hesap bakiyesi
     * için (DayCloseAccountCount.computed_balance).
     */
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM Posting p " +
            "WHERE p.account.id = :accountId AND p.journalEntry.entryDate <= :asOf")
    BigDecimal sumAmountByAccountIdAsOf(@Param("accountId") UUID accountId,
                                        @Param("asOf") LocalDate asOf);

    /**
     * Bir işletmenin belirli bir GÜNDE, belirli bir hesap-id listesindeki
     * (parası-olan hesaplar) konum bacaklarının (LOCATION_MOVE) işaretli
     * toplamı = o günün NET konum hareketi. Pozitif = net giriş, negatif = çıkış.
     *
     * <p>SAĞLAMA HESAP: net hareket = totalIn − totalOut. computed = opening + net.</p>
     */
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM Posting p " +
            "WHERE p.journalEntry.business.id = :businessId " +
            "AND p.journalEntry.entryDate = :date " +
            "AND p.account.id IN :accountIds " +
            "AND p.legKind = com.bizboard.common.enums.PostingLegKind.LOCATION_MOVE")
    BigDecimal sumLocationFlowForDate(@Param("businessId") UUID businessId,
                                      @Param("date") LocalDate date,
                                      @Param("accountIds") List<UUID> accountIds);

    /**
     * Bir günde belirli hesaplara giren (amount > 0) konum bacaklarının toplamı
     * (TOPLAM GELEN). Drill-down/rapor için ayrı in/out.
     */
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM Posting p " +
            "WHERE p.journalEntry.business.id = :businessId " +
            "AND p.journalEntry.entryDate = :date " +
            "AND p.account.id IN :accountIds " +
            "AND p.legKind = com.bizboard.common.enums.PostingLegKind.LOCATION_MOVE " +
            "AND p.amount > 0")
    BigDecimal sumLocationInForDate(@Param("businessId") UUID businessId,
                                    @Param("date") LocalDate date,
                                    @Param("accountIds") List<UUID> accountIds);

    /**
     * Bir günde belirli hesaplardan çıkan (amount < 0) konum bacaklarının
     * toplamı (negatif; çağıran abs/negate alır). (TOPLAM GİDEN.)
     */
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM Posting p " +
            "WHERE p.journalEntry.business.id = :businessId " +
            "AND p.journalEntry.entryDate = :date " +
            "AND p.account.id IN :accountIds " +
            "AND p.legKind = com.bizboard.common.enums.PostingLegKind.LOCATION_MOVE " +
            "AND p.amount < 0")
    BigDecimal sumLocationOutForDate(@Param("businessId") UUID businessId,
                                     @Param("date") LocalDate date,
                                     @Param("accountIds") List<UUID> accountIds);

    /**
     * Drill-down: bir gün + hesap listesi için tüm LOCATION_MOVE posting'leri
     * (kaynak entry ile birlikte). Kaçak kaynağı tespiti için işlem listesi.
     */
    @Query("SELECT p FROM Posting p " +
            "WHERE p.journalEntry.business.id = :businessId " +
            "AND p.journalEntry.entryDate = :date " +
            "AND p.account.id IN :accountIds " +
            "AND p.legKind = com.bizboard.common.enums.PostingLegKind.LOCATION_MOVE")
    List<Posting> findLocationLegsForDate(@Param("businessId") UUID businessId,
                                          @Param("date") LocalDate date,
                                          @Param("accountIds") List<UUID> accountIds);
}
