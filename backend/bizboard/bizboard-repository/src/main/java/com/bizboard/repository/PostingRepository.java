package com.bizboard.repository;

import com.bizboard.common.entity.Posting;
import org.springframework.data.jpa.repository.EntityGraph;
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
     *
     * <p><b>Gün Açılışı:</b> devir-yuvarlama düzeltmesi ({@code DAY_CLOSE_ADJUST})
     * günün opening'ine ZATEN baked'tır (DayOpen.roundedTotal) — gün İÇİ harekete
     * DAHİL EDİLMEZ, aksi halde çift sayılırdı (opening + flow). Bu yüzden tüm
     * in/out/flow toplamları {@code DAY_CLOSE_ADJUST} kaynağını HARİÇ tutar.</p>
     */
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM Posting p " +
            "WHERE p.journalEntry.business.id = :businessId " +
            "AND p.journalEntry.entryDate = :date " +
            "AND p.account.id IN :accountIds " +
            "AND p.legKind = com.bizboard.common.enums.PostingLegKind.LOCATION_MOVE " +
            "AND p.journalEntry.sourceType <> com.bizboard.common.enums.JournalSourceType.DAY_CLOSE_ADJUST")
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
            "AND p.journalEntry.sourceType <> com.bizboard.common.enums.JournalSourceType.DAY_CLOSE_ADJUST " +
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
            "AND p.journalEntry.sourceType <> com.bizboard.common.enums.JournalSourceType.DAY_CLOSE_ADJUST " +
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

    // ───────── Ledger v2 (Faz C): POS kâr-payı / operatör statement / aylık P&L ─────────

    /**
     * Bir deal'in PROFIT_SHARE journal entry'lerini getirir (idempotency +
     * reversal + provisional→final). {@code source_type=PROFIT_SHARE} +
     * {@code source_ref_id=dealId}. Bir deal'in birden çok kâr posting'i olabilir
     * (her operatör + provisional/final adjust ayrı bacak).
     */
    @Query("SELECT p FROM Posting p " +
            "WHERE p.journalEntry.sourceType = com.bizboard.common.enums.JournalSourceType.PROFIT_SHARE " +
            "AND p.journalEntry.sourceRefId = :dealId")
    List<Posting> findProfitShareByDealId(@Param("dealId") UUID dealId);

    /**
     * Operatör kâr-merkezi statement: bir hesabın tüm posting'leri (kaynak entry
     * ile), tarih sırası. READ-ONLY statement görünümü için (biriken kâr +
     * ödemeler). Sayfalama yerine tam liste — operatör başına hacim sınırlı.
     */
    @Query("SELECT p FROM Posting p " +
            "WHERE p.account.id = :accountId " +
            "ORDER BY p.journalEntry.entryDate DESC, p.journalEntry.createdAt DESC")
    List<Posting> findByAccountIdWithEntry(@Param("accountId") UUID accountId);

    /**
     * Aylık P&L kategori kırılımı: bir dönemde belirli {@code leg_kind} (gelir/
     * gider/masraf) bacaklarının kategori bazlı toplamı. P&L bacakları account
     * NULL'dır; işaret konvansiyonu: PNL_INCOME negatif (gelir hesaba +, P&L
     * bacağı −), PNL_EXPENSE/PNL_COST pozitif. Rapor servisi işareti normalize eder.
     *
     * @return [categoryId, categoryName, Σ amount] satırları
     */
    @Query("SELECT p.category.id, p.category.name, COALESCE(SUM(p.amount), 0) " +
            "FROM Posting p " +
            "WHERE p.journalEntry.business.id = :businessId " +
            "AND p.journalEntry.entryDate >= :from AND p.journalEntry.entryDate <= :to " +
            "AND p.legKind = :legKind " +
            "GROUP BY p.category.id, p.category.name")
    List<Object[]> sumPnlByCategoryForPeriod(@Param("businessId") UUID businessId,
                                             @Param("from") LocalDate from,
                                             @Param("to") LocalDate to,
                                             @Param("legKind") com.bizboard.common.enums.PostingLegKind legKind);

    /**
     * Aylık P&L toplamı bir {@code leg_kind} için (kategori kırılımsız). Hızlı
     * özet (gelir/gider/masraf üst-satır).
     */
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM Posting p " +
            "WHERE p.journalEntry.business.id = :businessId " +
            "AND p.journalEntry.entryDate >= :from AND p.journalEntry.entryDate <= :to " +
            "AND p.legKind = :legKind")
    BigDecimal sumPnlForPeriod(@Param("businessId") UUID businessId,
                               @Param("from") LocalDate from,
                               @Param("to") LocalDate to,
                               @Param("legKind") com.bizboard.common.enums.PostingLegKind legKind);

    /**
     * Operatör/kâr-merkezi bazlı aylık kâr: bir dönemde belirli hesaplara (operatör
     * kasaları) düşen POSITIVE kâr posting'lerinin (PROFIT_SHARE entry) toplamı.
     * Operatöre ödemeler (LOCATION_MOVE) ayrı sorgulanır.
     *
     * @return [accountId, Σ amount] — operatör kasası bazında biriken kâr.
     */
    @Query("SELECT p.account.id, COALESCE(SUM(p.amount), 0) FROM Posting p " +
            "WHERE p.journalEntry.business.id = :businessId " +
            "AND p.journalEntry.entryDate >= :from AND p.journalEntry.entryDate <= :to " +
            "AND p.account.id IN :accountIds " +
            "GROUP BY p.account.id")
    List<Object[]> sumByAccountForPeriod(@Param("businessId") UUID businessId,
                                         @Param("from") LocalDate from,
                                         @Param("to") LocalDate to,
                                         @Param("accountIds") List<UUID> accountIds);

    // ───────── Ledger v2 (Faz D): patron raporları ─────────

    /**
     * Günlük hareket defteri (daybook): bir dönemde gerçek hesap bacakları
     * (account NOT NULL — konum hareketleri), kaynak entry + kategori ile.
     * Tarih sırası (eski → yeni). P&L bacakları (account NULL) hariç — rapor
     * "hangi hesaba ne girdi/çıktı" gösterir.
     */
    // Performans (N+1 fix): daybook döngüsü p.journalEntry / p.account / p.category
    // lazy erişiyor. Hepsi @ManyToOne — LEFT JOIN kartezyen patlama YAPMAZ, sonuç
    // AYNI (satır = posting). Ek per-posting SELECT'ler elenir.
    @EntityGraph(attributePaths = {"journalEntry", "account", "category"})
    @Query("SELECT p FROM Posting p " +
            "WHERE p.journalEntry.business.id = :businessId " +
            "AND p.journalEntry.entryDate >= :from AND p.journalEntry.entryDate <= :to " +
            "AND p.account IS NOT NULL " +
            "ORDER BY p.journalEntry.entryDate ASC, p.journalEntry.createdAt ASC")
    List<Posting> findAccountLegsForPeriod(@Param("businessId") UUID businessId,
                                           @Param("from") LocalDate from,
                                           @Param("to") LocalDate to);
}
