package com.bizboard.common.enums;

/**
 * AI modülü (v1.1): bir embedding kaydının hangi finansal özet türünden
 * üretildiğini belirtir. RAG retrieve'de filtre/teşhis için kullanılır.
 *
 * <p>YENİ finansal hesap mantığı yoktur — bu enum yalnız mevcut verinin
 * (işlem/kategori/rapor) hangi açıdan özetlendiğini etiketler.</p>
 */
public enum AiEmbeddingKind {

    /** Tek bir işlem (transaction) doğal-dil özeti. */
    TRANSACTION,

    /** Bir kategori + o kategorideki toplam/akış özeti. */
    CATEGORY_SUMMARY,

    /** Aylık gelir/gider/net kâr özeti (period bazlı). */
    MONTHLY_SUMMARY,

    /** Nakit akışı / kasa özeti. */
    CASH_FLOW_SUMMARY
}
