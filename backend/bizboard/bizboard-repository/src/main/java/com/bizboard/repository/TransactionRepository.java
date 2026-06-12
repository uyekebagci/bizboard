package com.bizboard.repository;

import com.bizboard.common.entity.Transaction;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface TransactionRepository extends JpaRepository<Transaction, UUID> {

    /*
     * Performans (N+1 fix): {@code DtoMapper.toTransactionDto}'nun lazy eriştiği
     * to-ONE ilişkileri liste sorgularına {@code @EntityGraph(attributePaths = {...})}
     * ile eager fetch edilir. Hepsi {@code @ManyToOne} olduğu için LEFT JOIN
     * kartezyen patlama YAPMAZ — satır sayısı/sonuç AYNI kalır, yalnız ek
     * per-row SELECT'ler elenir. attributePaths annotation argümanı derleme-zamanı
     * sabit olmak zorunda olduğundan her metoda inline yazılır (paylaşılan paths:
     * business, category, bankAccount, relatedBankAccount, targetCounterpart,
     * createdBy, posDevice, posDevice.ownerMyCompany).
     */

    /** WP 08617251: closure session'a etiketli tx'ler (rollback/finalize için). */
    List<Transaction> findByClosureSessionId(UUID closureSessionId);

    /** WP 08617251: cross-user guard — yalnız aktör'ün kendi session tx'leri. */
    List<Transaction> findByClosureSessionIdAndCreatedBy_Id(
            UUID closureSessionId, UUID createdById);

    List<Transaction> findByBusinessIdOrderByDateDesc(UUID businessId, Pageable pageable);

    /**
     * Beta v1.1 fix: Son İşlemler widget'ı için date DESC + createdAt DESC
     * tie-breaker. Aynı gün eklenen tx'ler arasında en son insert üstte.
     */
    @EntityGraph(attributePaths = {"business", "category", "bankAccount", "relatedBankAccount",
            "targetCounterpart", "createdBy", "posDevice", "posDevice.ownerMyCompany"})
    @Query("SELECT t FROM Transaction t WHERE t.business.id = :businessId " +
            "ORDER BY t.date DESC, t.createdAt DESC")
    List<Transaction> findByBusinessIdOrderByDateDescCreatedAtDesc(
            @Param("businessId") UUID businessId, Pageable pageable);

    @Query("SELECT t FROM Transaction t WHERE t.business.id = :businessId " +
            "AND YEAR(t.date) = :year AND MONTH(t.date) = :month ORDER BY t.date DESC")
    List<Transaction> findByBusinessIdAndMonth(
            @Param("businessId") UUID businessId,
            @Param("year") int year,
            @Param("month") int month);

    @EntityGraph(attributePaths = {"business", "category", "bankAccount", "relatedBankAccount",
            "targetCounterpart", "createdBy", "posDevice", "posDevice.ownerMyCompany"})
    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds ORDER BY t.createdAt DESC")
    List<Transaction> findByBusinessIdInOrderByCreatedAtDesc(
            @Param("businessIds") List<UUID> businessIds, Pageable pageable);

    // Tüm işlemler (limitsiz, tarih sıralı) - birden fazla işletme
    @EntityGraph(attributePaths = {"business", "category", "bankAccount", "relatedBankAccount",
            "targetCounterpart", "createdBy", "posDevice", "posDevice.ownerMyCompany"})
    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds ORDER BY t.date DESC")
    List<Transaction> findByBusinessIdInOrderByDateDesc(@Param("businessIds") List<UUID> businessIds);

    // Tek işletme tüm işlemler
    @EntityGraph(attributePaths = {"business", "category", "bankAccount", "relatedBankAccount",
            "targetCounterpart", "createdBy", "posDevice", "posDevice.ownerMyCompany"})
    List<Transaction> findByBusinessIdOrderByDateDesc(UUID businessId);

    /*
     * PERF (server-pagination, non-breaking): {@code /portfolio/transactions/all}
     * için sayfalı + DB-seviyesinde direction filtreli varyantlar. Eski parametresiz
     * uçlar AYNEN korunur (yukarıdaki {@code findByBusinessIdInOrderByDateDesc}
     * vb. silinmedi); bu metodlar yalnız {@code ?page=&size=} geldiğinde kullanılır.
     *
     * <p>Direction filtresi artık bellekte değil DB'de ({@code WHERE t.direction = ...}):
     * eskiden tüm tx çekilip {@code stream().filter()} ile direction eleniyordu —
     * SONUÇ aynı kalır, payload/IO {@code WHERE} ile düşer. Sıralama
     * {@code date DESC} (eski davranışla birebir). to-ONE {@code @EntityGraph}
     * eager (toTransactionDto N+1 fix); to-ONE oldukları için {@code Pageable}
     * ile DB-seviyesi sayfalama doğru çalışır (kartezyen patlama yok).</p>
     */

    // — birden fazla işletme, direction filtresiz, sayfalı —
    @EntityGraph(attributePaths = {"business", "category", "bankAccount", "relatedBankAccount",
            "targetCounterpart", "createdBy", "posDevice", "posDevice.ownerMyCompany"})
    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds ORDER BY t.date DESC")
    org.springframework.data.domain.Page<Transaction> findByBusinessIdIn(
            @Param("businessIds") List<UUID> businessIds, Pageable pageable);

    // — birden fazla işletme, direction DB'de filtreli, sayfalı —
    @EntityGraph(attributePaths = {"business", "category", "bankAccount", "relatedBankAccount",
            "targetCounterpart", "createdBy", "posDevice", "posDevice.ownerMyCompany"})
    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds " +
            "AND t.direction = :direction ORDER BY t.date DESC")
    org.springframework.data.domain.Page<Transaction> findByBusinessIdInAndDirection(
            @Param("businessIds") List<UUID> businessIds,
            @Param("direction") com.bizboard.common.enums.TransactionDirection direction,
            Pageable pageable);

    // — tek işletme, direction filtresiz, sayfalı —
    @EntityGraph(attributePaths = {"business", "category", "bankAccount", "relatedBankAccount",
            "targetCounterpart", "createdBy", "posDevice", "posDevice.ownerMyCompany"})
    @Query("SELECT t FROM Transaction t WHERE t.business.id = :businessId ORDER BY t.date DESC")
    org.springframework.data.domain.Page<Transaction> findByBusinessId(
            @Param("businessId") UUID businessId, Pageable pageable);

    // — tek işletme, direction DB'de filtreli, sayfalı —
    @EntityGraph(attributePaths = {"business", "category", "bankAccount", "relatedBankAccount",
            "targetCounterpart", "createdBy", "posDevice", "posDevice.ownerMyCompany"})
    @Query("SELECT t FROM Transaction t WHERE t.business.id = :businessId " +
            "AND t.direction = :direction ORDER BY t.date DESC")
    org.springframework.data.domain.Page<Transaction> findByBusinessIdAndDirection(
            @Param("businessId") UUID businessId,
            @Param("direction") com.bizboard.common.enums.TransactionDirection direction,
            Pageable pageable);

    /**
     * Performans (AccountStatementService N+1/full-scan fix): bir işletmenin
     * BELİRLİ counterpart'a bağlı tx'leri. Önce tüm business tx'i çekip bellekte
     * {@code targetCounterpart.id} filtrelemek yerine DB'de filtrele — SONUÇ AYNI,
     * çok daha az satır. {@code @EntityGraph} ile to-ONE'lar eager (toTransactionDto).
     */
    @EntityGraph(attributePaths = {"business", "category", "bankAccount", "relatedBankAccount",
            "targetCounterpart", "createdBy", "posDevice", "posDevice.ownerMyCompany"})
    @Query("SELECT t FROM Transaction t WHERE t.business.id = :businessId " +
            "AND t.targetCounterpart.id = :counterpartId " +
            "ORDER BY t.date DESC")
    List<Transaction> findByBusinessIdAndTargetCounterpartIdOrderByDateDesc(
            @Param("businessId") UUID businessId,
            @Param("counterpartId") UUID counterpartId);

    // Dinamik tarih aralığı sorgusu - tek işletme
    @Query("SELECT t FROM Transaction t WHERE t.business.id = :businessId " +
            "AND t.date >= :startDate AND t.date <= :endDate ORDER BY t.date DESC")
    List<Transaction> findByBusinessIdAndDateBetween(
            @Param("businessId") UUID businessId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    // Dinamik tarih aralığı sorgusu - birden fazla işletme
    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds " +
            "AND t.date >= :startDate AND t.date <= :endDate ORDER BY t.date DESC")
    List<Transaction> findByBusinessIdInAndDateBetween(
            @Param("businessIds") List<UUID> businessIds,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    // v1.6.3: POS işlemleri — payment_method filtreli
    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds " +
            "AND t.paymentMethod = :paymentMethod ORDER BY t.date DESC, t.createdAt DESC")
    List<Transaction> findByBusinessIdInAndPaymentMethod(
            @Param("businessIds") List<UUID> businessIds,
            @Param("paymentMethod") String paymentMethod);

    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds " +
            "AND t.paymentMethod = :paymentMethod AND t.date = :date " +
            "ORDER BY t.createdAt DESC")
    List<Transaction> findByBusinessIdInAndPaymentMethodAndDate(
            @Param("businessIds") List<UUID> businessIds,
            @Param("paymentMethod") String paymentMethod,
            @Param("date") LocalDate date);

    // v1.6.23.7: tarih aralığı (frontend pos-cihazlari sayfası days=30 için).
    @Query("SELECT t FROM Transaction t WHERE t.business.id IN :businessIds " +
            "AND t.paymentMethod = :paymentMethod AND t.date BETWEEN :from AND :to " +
            "ORDER BY t.date DESC, t.createdAt DESC")
    List<Transaction> findByBusinessIdInAndPaymentMethodAndDateBetween(
            @Param("businessIds") List<UUID> businessIds,
            @Param("paymentMethod") String paymentMethod,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    // v1.6.23.9 (TODO 8c7ffaac): Settled olmamış POS tx'ler.
    // pos_settled NULL veya FALSE olanlar dahil; TRUE değil.
    @Query("SELECT t FROM Transaction t WHERE t.paymentMethod = 'POS' " +
            "AND (t.posSettled IS NULL OR t.posSettled = false) " +
            "ORDER BY t.date DESC, t.createdAt DESC")
    List<Transaction> findUnsettledPosTransactions();

    // v1.6.23.13 (TODO 5cee5f99): POS device detay sayfası — cihaza ait tüm tx'ler.
    @Query("SELECT t FROM Transaction t WHERE t.paymentMethod = 'POS' " +
            "AND t.posDevice.id = :deviceId " +
            "ORDER BY t.date DESC, t.createdAt DESC")
    List<Transaction> findByPosDeviceIdOrderByDateDesc(@Param("deviceId") UUID deviceId);

    @Query("SELECT t FROM Transaction t WHERE t.paymentMethod = 'POS' " +
            "AND (t.posSettled IS NULL OR t.posSettled = false) " +
            "AND t.posDevice.id = :deviceId " +
            "ORDER BY t.date DESC, t.createdAt DESC")
    List<Transaction> findUnsettledPosTransactionsByDevice(@Param("deviceId") UUID deviceId);

    /**
     * v1.6.19 (WP-2): Bir takvim günündeki tüm transaction'lar (tek-tenant
     * cash closing hesabı için — business filtresi yok).
     */
    List<Transaction> findByDate(LocalDate date);

    /**
     * Performans (ClosingCalculator full-scan fix): bir işletmenin belirli
     * günündeki tx'leri. Önce tüm gün tx'ini ({@code findByDate}) çekip bellekte
     * {@code business.id} filtrelemek yerine DB'de filtrele — SONUÇ AYNI, çok daha
     * az satır (özellikle çok-tenant büyüdükçe). business-scoped kapanış için.
     */
    List<Transaction> findByBusinessIdAndDate(UUID businessId, LocalDate date);

    /**
     * v1.6.20 (WP-3): "Hesaptan Harcama" widget — gün + paymentMethod + direction.
     */
    @Query("SELECT t FROM Transaction t " +
            "WHERE t.date = :date " +
            "  AND t.paymentMethod = :paymentMethod " +
            "  AND t.direction = :direction " +
            "ORDER BY t.createdAt DESC")
    List<Transaction> findByDateAndPaymentMethodAndDirection(
            @Param("date") LocalDate date,
            @Param("paymentMethod") String paymentMethod,
            @Param("direction") com.bizboard.common.enums.TransactionDirection direction);

    /** v1.6.20 (WP-3): POS cihazı bazında bugünkü tx'ler. */
    @Query("SELECT t FROM Transaction t " +
            "WHERE t.posDevice.id = :deviceId AND t.date = :date " +
            "ORDER BY t.createdAt DESC")
    List<Transaction> findByPosDeviceIdAndDate(
            @Param("deviceId") UUID deviceId,
            @Param("date") LocalDate date);

    /**
     * M-2 (R3): birden çok POS cihazının bugünkü tx'lerini TEK sorguda çek
     * (consolidated dashboard'daki cihaz-başı N+1 fix'i). Çağıran tarafta
     * posDevice.id'ye göre gruplanır.
     */
    @Query("SELECT t FROM Transaction t " +
            "WHERE t.posDevice.id IN :deviceIds AND t.date = :date " +
            "ORDER BY t.createdAt DESC")
    List<Transaction> findByPosDeviceIdInAndDate(
            @Param("deviceIds") java.util.Collection<UUID> deviceIds,
            @Param("date") LocalDate date);

    /**
     * M-2 (R3): tek POS cihazının tarih-aralığı tx'leri — gün-gün döngüde
     * tekrar tekrar sorgulamak yerine TEK sorgu (PosAnalytics N+1 fix'i).
     * Çağıran tarafta tarihe göre gruplanır.
     */
    @Query("SELECT t FROM Transaction t " +
            "WHERE t.posDevice.id = :deviceId AND t.date BETWEEN :from AND :to " +
            "ORDER BY t.date DESC, t.createdAt DESC")
    List<Transaction> findByPosDeviceIdAndDateBetween(
            @Param("deviceId") UUID deviceId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    // ── v1.7.0-beta (Bankalar WP TODO abb90050): Transfer pair queries ──

    /** Transfer pair'in iki tarafını döner (boyut = 2 olmalı, deviation log'lanmalı). */
    List<Transaction> findByTransferPairIdOrderByDirectionAsc(java.util.UUID transferPairId);

    /**
     * v1.7.0-beta (Bankalar WP TODO 0aa4c6d1): NAKIT akış hesabında transfer
     * tx'lerini dışla — TransactionService.closing'de + sum hesaplarında.
     * Kullanım: stream().filter(t → t.kind == NORMAL) yerine query-level filter.
     */
    /**
     * v1.6.23.21 (Security WP / arch-rules §1.3.A): business-scoped gün+pm+dir.
     * ConsolidatedDashboard "Hesaptan Harcama" widget'ı için.
     */
    @Query("SELECT t FROM Transaction t " +
            "WHERE t.business.id = :businessId " +
            "  AND t.date = :date " +
            "  AND t.paymentMethod = :paymentMethod " +
            "  AND t.direction = :direction " +
            "ORDER BY t.createdAt DESC")
    List<Transaction> findByBusinessIdAndDateAndPaymentMethodAndDirection(
            @Param("businessId") UUID businessId,
            @Param("date") LocalDate date,
            @Param("paymentMethod") String paymentMethod,
            @Param("direction") com.bizboard.common.enums.TransactionDirection direction);

    /**
     * v1.6.23.21 (Security WP): business-scoped unsettled POS — consolidated
     * pending POS receivables hesabı için.
     */
    @Query("SELECT t FROM Transaction t WHERE t.paymentMethod = 'POS' " +
            "AND (t.posSettled IS NULL OR t.posSettled = false) " +
            "AND t.business.id = :businessId " +
            "ORDER BY t.date DESC, t.createdAt DESC")
    List<Transaction> findUnsettledPosTransactionsByBusinessId(
            @Param("businessId") UUID businessId);

    /**
     * v1.6.23.19 (UI Fix WP TODO 8b961444): Banka hesabı detay modalı — son N tx
     * + 30 günlük bakiye trendi için kaynak. paymentMethod=HESAPDAN olan tüm
     * tx'ler bu hesabın bakiyesini etkiler.
     */
    @Query("SELECT t FROM Transaction t " +
            "WHERE t.bankAccount.id = :bankAccountId " +
            "ORDER BY t.date DESC, t.createdAt DESC")
    List<Transaction> findByBankAccountIdOrderByDateDesc(
            @Param("bankAccountId") UUID bankAccountId, Pageable pageable);

    @Query("SELECT t FROM Transaction t " +
            "WHERE t.bankAccount.id = :bankAccountId " +
            "AND t.date >= :from " +
            "ORDER BY t.date ASC, t.createdAt ASC")
    List<Transaction> findByBankAccountIdSince(
            @Param("bankAccountId") UUID bankAccountId,
            @Param("from") LocalDate from);

    /**
     * v1.6.23.19 (UI Fix WP TODO 8b961444): Banka hesabı detay modalı — aynı
     * işletmenin henüz settle edilmemiş POS tx'leri ("bu hesaba düşmesi
     * beklenen POS"). Bankacılık tarafında POS device → bank_account ilişkisi
     * yok; settle anında tx.bankAccount set ediliyor. O yüzden filtre tek
     * business level kalır.
     */
    @Query("SELECT t FROM Transaction t " +
            "WHERE t.paymentMethod = 'POS' " +
            "AND (t.posSettled IS NULL OR t.posSettled = false) " +
            "AND t.business.id = :businessId " +
            "ORDER BY t.date DESC, t.createdAt DESC")
    List<Transaction> findUnsettledPosTransactionsByBusiness(
            @Param("businessId") UUID businessId);
}
