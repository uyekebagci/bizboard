package com.bizboard.repository;

import com.bizboard.common.entity.FundLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * "Para İzi" (fund-trail) — {@link FundLink} repository.
 *
 * <p>Çift-yönlü görünüm için iki yönlü sorgu (source-side / target-side) +
 * tahsis (allocation) toplamı. Çok-tenant: servis {@code businessId} ile
 * çağırır, ayrıca her sorgu business-scoped.</p>
 */
public interface FundLinkRepository extends JpaRepository<FundLink, UUID> {

    /**
     * Bir KAYNAK işleme bağlı tüm bağlar — "bu para nereye gitti" (Kullanım/
     * Harcamalar görünümü). business-scoped (tenant guard).
     */
    @Query("SELECT fl FROM FundLink fl " +
            "WHERE fl.sourceTransaction.id = :sourceTxId AND fl.business.id = :businessId " +
            "ORDER BY fl.createdAt ASC")
    List<FundLink> findBySource(@Param("businessId") UUID businessId,
                                @Param("sourceTxId") UUID sourceTxId);

    /**
     * Bir HEDEF işlemin bağlı olduğu tüm kaynaklar — "bu para nereden geldi"
     * (Kaynak görünümü). business-scoped.
     */
    @Query("SELECT fl FROM FundLink fl " +
            "WHERE fl.targetTransaction.id = :targetTxId AND fl.business.id = :businessId " +
            "ORDER BY fl.createdAt ASC")
    List<FundLink> findByTarget(@Param("businessId") UUID businessId,
                                @Param("targetTxId") UUID targetTxId);

    /**
     * Bir kaynağa şu ana kadar TAHSİS edilmiş toplam tutar (Σ FundLink.amount).
     * {@code kalan = source.amount − allocated}. Hiç bağ yoksa 0 döner
     * (COALESCE). Over-allocation guard ve "kalan" göstergesi bunu kullanır.
     */
    @Query("SELECT COALESCE(SUM(fl.amount), 0) FROM FundLink fl " +
            "WHERE fl.sourceTransaction.id = :sourceTxId AND fl.business.id = :businessId")
    BigDecimal sumAllocatedBySource(@Param("businessId") UUID businessId,
                                    @Param("sourceTxId") UUID sourceTxId);

    /**
     * Bir HEDEF işleme şu ana kadar bağlanmış toplam tutar (Σ FundLink.amount).
     * Bir hedef kendi tutarından fazla "kaynaktan beslenmiş" gibi gösterilemez;
     * servis bu toplamı hedefin tutarıyla sınırlar (over-explain guard).
     */
    @Query("SELECT COALESCE(SUM(fl.amount), 0) FROM FundLink fl " +
            "WHERE fl.targetTransaction.id = :targetTxId AND fl.business.id = :businessId")
    BigDecimal sumLinkedToTarget(@Param("businessId") UUID businessId,
                                 @Param("targetTxId") UUID targetTxId);

    /**
     * Idempotency / tekrar-bağ kontrolü: aynı (source, target) çifti var mı?
     * Aynı çifte ikinci bağ engellenir (DB unique + servis ön-kontrol).
     */
    Optional<FundLink> findBySourceTransaction_IdAndTargetTransaction_Id(
            UUID sourceTransactionId, UUID targetTransactionId);

    /**
     * Bağlanabilir KAYNAK adayları (bind-picker): bir business'ın işlemleri +
     * her birine tahsis edilmiş toplam ({@code allocated}). Servis kalanı
     * ({@code amount − allocated}) &gt; 0 olanları süzer.
     *
     * <p>Her satır {@code Object[]{ Transaction tx, BigDecimal allocated }}.
     * LEFT JOIN olduğu için hiç bağı olmayan tx'ler de gelir (allocated=0).
     * En yeni tarih önce.</p>
     */
    @Query("SELECT t, COALESCE(SUM(fl.amount), 0) " +
            "FROM Transaction t " +
            "LEFT JOIN FundLink fl ON fl.sourceTransaction = t AND fl.business.id = :businessId " +
            "WHERE t.business.id = :businessId " +
            "GROUP BY t " +
            "ORDER BY t.date DESC, t.createdAt DESC")
    List<Object[]> findSourceCandidatesWithAllocation(@Param("businessId") UUID businessId);
}
