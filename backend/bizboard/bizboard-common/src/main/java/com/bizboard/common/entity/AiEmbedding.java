package com.bizboard.common.entity;

import com.bizboard.common.enums.AiEmbeddingKind;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * AI modülü (v1.1): işletmenin finansal verisinden üretilmiş bir embedding
 * kaydı. RAG (retrieval-augmented generation) için tenant-scope vektör deposu.
 *
 * <p><b>Multi-tenant (arch-rules §1.1 A-sınıfı):</b> {@code business_id NOT NULL}.
 * Her retrieve/store guard'dan geçer; cross-tenant sızıntı yoktur.</p>
 *
 * <p><b>pgvector graceful-degrade:</b> vektör hem JPA tarafından yönetilen
 * portatif {@code embedding_json} (TEXT, float dizisi JSON'u) hem de — pgvector
 * eklentisi mevcutsa — migration runner'ın eklediği native {@code embedding}
 * ({@code vector}) kolonunda tutulur. Retrieve, pgvector varsa native ANN
 * sorgusu; yoksa JSON üzerinden in-memory kosinüs benzerliği yapar. pgvector
 * yoksa app ÇÖKMEZ.</p>
 *
 * <p>YENİ finansal hesap mantığı YOKTUR — yalnız mevcut veriyi (işlem/kategori/
 * rapor özetleri) okuyup özetler.</p>
 */
@Entity
@Table(name = "ai_embeddings", indexes = {
        @Index(name = "idx_ai_emb_business", columnList = "business_id"),
        @Index(name = "idx_ai_emb_business_source", columnList = "business_id, source_type, source_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiEmbedding {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Tenant sahibi — arch-rules §1.1 A-sınıfı. */
    @Column(name = "business_id", nullable = false)
    private UUID businessId;

    /** Kaynak türü (TRANSACTION / CATEGORY_SUMMARY / MONTHLY_SUMMARY / ...). */
    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false, length = 32)
    private AiEmbeddingKind sourceType;

    /**
     * Kaynak kaydın id'si (örn. transaction id). Türetilmiş özetlerde
     * (aylık/kategori) deterministik bir UUID veya null olabilir.
     */
    @Column(name = "source_id")
    private UUID sourceId;

    /** Embed edilen doğal-dil metin (RAG context'te LLM'e geri verilir). */
    @Column(name = "content", columnDefinition = "TEXT", nullable = false)
    private String content;

    /**
     * Vektör — JSON float dizisi (portatif fallback). Native pgvector kolonu
     * migration runner tarafından ayrıca senkronlanır; bu kolon her zaman dolu.
     */
    @Column(name = "embedding_json", columnDefinition = "TEXT", nullable = false)
    private String embeddingJson;

    /** Embedding sağlayıcısı (voyage/openai) — teşhis + yeniden-üretim için. */
    @Column(name = "provider", length = 32)
    private String provider;

    /** Embedding modeli (örn. voyage-3, text-embedding-3-small). */
    @Column(name = "model", length = 64)
    private String model;

    /** Vektör boyutu (model değişimini tespit için). */
    @Column(name = "dimension")
    private Integer dimension;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
