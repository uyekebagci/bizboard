package com.bizboard.repository.ai;

import com.bizboard.common.entity.AiEmbedding;
import com.bizboard.common.enums.AiEmbeddingKind;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * AI modülü (v1.1): tenant-scope embedding deposu.
 *
 * <p>Tüm read query'leri {@code business_id} filtreli — repository seviyesinde
 * de cross-tenant sızıntı engellenir (defense-in-depth; servis ayrıca guard'dan
 * geçer).</p>
 */
public interface AiEmbeddingRepository extends JpaRepository<AiEmbedding, UUID> {

    /** Bir işletmenin tüm embedding'leri (pgvector yoksa in-memory benzerlik için). */
    List<AiEmbedding> findByBusinessId(UUID businessId);

    /** Belirli kaynak türündeki embedding'ler (yeniden-üretimde idempotency). */
    List<AiEmbedding> findByBusinessIdAndSourceType(UUID businessId, AiEmbeddingKind sourceType);

    /** Belirli bir kaynak kaydın embedding'i (varsa güncelle, yoksa ekle). */
    List<AiEmbedding> findByBusinessIdAndSourceTypeAndSourceId(
            UUID businessId, AiEmbeddingKind sourceType, UUID sourceId);

    long countByBusinessId(UUID businessId);

    /** Bir işletmenin embedding'lerini temizle (yeniden-indeksleme öncesi). */
    @Modifying
    @Transactional
    void deleteByBusinessId(UUID businessId);

    @Modifying
    @Transactional
    void deleteByBusinessIdAndSourceType(UUID businessId, AiEmbeddingKind sourceType);

    /**
     * pgvector ANN sorgusu — yalnız native {@code embedding} kolonu varsa
     * çağrılır (EmbeddingMigrationRunner flag'i ile kontrol edilir). Kosinüs
     * mesafesine ({@code <=>}) göre en yakın N kayıt. Tenant filtreli.
     *
     * <p>Native SQL: pgvector operatörü JPQL'de yok. {@code :queryVec} pgvector
     * literal formatında ('[0.1,0.2,...]') string olarak bind edilir.</p>
     */
    @Query(value = """
            SELECT id FROM ai_embeddings
            WHERE business_id = :businessId AND embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:queryVec AS vector)
            LIMIT :topK
            """, nativeQuery = true)
    List<UUID> findNearestIdsByPgvector(@Param("businessId") UUID businessId,
                                        @Param("queryVec") String queryVec,
                                        @Param("topK") int topK);
}
