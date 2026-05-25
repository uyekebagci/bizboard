package com.bizboard.repository;

import com.bizboard.common.entity.SubCashTxInclusion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Set;
import java.util.UUID;

public interface SubCashTxInclusionRepository extends JpaRepository<SubCashTxInclusion, UUID> {

    /** Bir sub-cash'in tüm inclusion'ları (tx detayı ile birlikte servis kullanır). */
    List<SubCashTxInclusion> findBySubCash_Id(UUID subCashId);

    /** Belirli (sub-cash, tx) inclusion var mı? Duplicate engellemek için. */
    boolean existsBySubCash_IdAndTransaction_Id(UUID subCashId, UUID transactionId);

    /** Belirli tx'in tüm inclusion'ları — tx güncellemede entity ID değişimi sonrası. */
    List<SubCashTxInclusion> findByTransaction_Id(UUID transactionId);

    /** Tx silinmeden önce inclusion'ları toplu sil (FK CASCADE de mevcut, defensive). */
    @Modifying
    @Query("DELETE FROM SubCashTxInclusion i WHERE i.transaction.id = :txId")
    int deleteByTransactionId(@Param("txId") UUID txId);

    /** Belirli inclusion silme — DELETE /inclusions/{txId} endpoint'i için. */
    @Modifying
    @Query("DELETE FROM SubCashTxInclusion i WHERE i.subCash.id = :subCashId AND i.transaction.id = :txId")
    int deleteBySubCashIdAndTransactionId(
            @Param("subCashId") UUID subCashId,
            @Param("txId") UUID transactionId);

    /** Bir sub-cash'e dahil tx ID'leri set'i — available-tx query için NOT IN listesi. */
    @Query("SELECT i.transaction.id FROM SubCashTxInclusion i WHERE i.subCash.id = :subCashId")
    Set<UUID> findIncludedTxIdsBySubCashId(@Param("subCashId") UUID subCashId);
}
