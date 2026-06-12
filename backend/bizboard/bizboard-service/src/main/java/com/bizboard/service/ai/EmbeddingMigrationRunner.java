package com.bizboard.service.ai;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * AI modülü (v1.1): pgvector eklentisi + native {@code embedding} kolonu için
 * idempotent, NON-FATAL migration runner ({@code CariMigrationRunner} deseni).
 *
 * <p>Startup'ta sırasıyla:</p>
 * <ol>
 *   <li>{@code CREATE EXTENSION IF NOT EXISTS vector} dener. Başarısızsa
 *       (eklenti yüklü değil / yetki yok) graceful: pgvector flag false kalır,
 *       app ÇÖKMEZ — retrieve in-memory kosinüs fallback'e döner.</li>
 *   <li>pgvector varsa: {@code ai_embeddings.embedding vector} kolonunu (yoksa)
 *       ekler ve ivfflat ANN index'i kurar. {@code ai_embeddings} tablosunu
 *       Hibernate {@code ddl-auto=update} üretir; bu runner yalnız pgvector'a
 *       özgü, Hibernate'in yönetemediği kısmı tamamlar.</li>
 * </ol>
 *
 * <p>{@link #isPgvectorAvailable()} flag'i {@code EmbeddingService}/repository
 * tarafından native ANN mu in-memory mi kullanılacağına karar vermek için
 * okunur.</p>
 *
 * <p>@Order(15): {@code CariMigrationRunner} (@Order 10) sonrası, businesses/
 * bootstrap akışlarıyla çakışmadan.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(15)
public class EmbeddingMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;
    private final AiProperties props;

    private static final AtomicBoolean PGVECTOR_AVAILABLE = new AtomicBoolean(false);

    /** pgvector kuruldu ve native ANN kullanılabilir mi (servisler okur). */
    public static boolean isPgvectorAvailable() {
        return PGVECTOR_AVAILABLE.get();
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!props.isEnabled()) {
            log.info("[ai-migration] AI modülü kapalı (app.ai.enabled=false) — pgvector kurulumu atlandı.");
            return;
        }
        log.info("[ai-migration] AI embedding schema/pgvector kontrolü başlıyor...");
        try {
            boolean ext = tryCreateExtension();
            if (!ext) {
                log.warn("[ai-migration] pgvector EKLENTİSİ YOK — graceful degrade: "
                        + "retrieve in-memory kosinüs benzerliği kullanacak.");
                PGVECTOR_AVAILABLE.set(false);
                return;
            }
            ensureNativeVectorColumn();
            ensureAnnIndex();
            PGVECTOR_AVAILABLE.set(true);
            log.info("[ai-migration] pgvector aktif — native ANN retrieve etkin.");
        } catch (Exception e) {
            // NON-FATAL: app çökmesin; modül in-memory fallback ile çalışır.
            PGVECTOR_AVAILABLE.set(false);
            log.error("[ai-migration] BAŞARISIZ — graceful degrade (in-memory). Hata: {}", e.getMessage(), e);
        }
    }

    private boolean tryCreateExtension() {
        try {
            jdbc.execute("CREATE EXTENSION IF NOT EXISTS vector");
            return true;
        } catch (Exception e) {
            log.warn("[ai-migration] CREATE EXTENSION vector başarısız: {}", e.getMessage());
            return false;
        }
    }

    /**
     * {@code ai_embeddings} tablosu Hibernate tarafından üretilir; burada yalnız
     * pgvector'a özgü {@code embedding vector(N)} kolonunu (yoksa) ekleriz.
     * Boyut, ilk embedding üretildiğinde popüler edilir — kolon nullable.
     */
    private void ensureNativeVectorColumn() {
        if (!tableExists("ai_embeddings")) {
            log.info("[ai-migration] ai_embeddings tablosu henüz yok (Hibernate sonradan üretir) — vector kolonu atlandı, bir sonraki başlatmada eklenecek.");
            return;
        }
        if (columnExists("ai_embeddings", "embedding")) {
            return;
        }
        int dim = resolveDimension();
        try {
            jdbc.execute("ALTER TABLE ai_embeddings ADD COLUMN IF NOT EXISTS embedding vector(" + dim + ")");
            log.info("[ai-migration] ai_embeddings.embedding vector({}) kolonu eklendi.", dim);
        } catch (Exception e) {
            log.warn("[ai-migration] embedding kolonu eklenemedi: {}", e.getMessage());
            throw e;
        }
    }

    private void ensureAnnIndex() {
        if (!columnExists("ai_embeddings", "embedding")) return;
        try {
            // ivfflat kosinüs index — büyük tablolarda ANN hızlandırması.
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_ai_emb_vec_cos "
                    + "ON ai_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)");
        } catch (Exception e) {
            // Index başarısızlığı non-fatal: seq-scan ANN hâlâ çalışır.
            log.warn("[ai-migration] ivfflat index kurulamadı (non-fatal, seq-scan devrede): {}", e.getMessage());
        }
    }

    /**
     * Vektör boyutu — modele göre yaygın varsayılan. Hatalı boyutta INSERT
     * pgvector tarafından reddedilir; gerçek boyut ilk embed'de doğrulanır.
     */
    private int resolveDimension() {
        String model = props.getEmbedding().getModel() == null ? "" : props.getEmbedding().getModel().toLowerCase();
        if (model.contains("text-embedding-3-large")) return 3072;
        if (model.contains("text-embedding-3-small")) return 1536;
        if (model.contains("voyage")) return 1024; // voyage-3 ailesi
        return 1536; // güvenli varsayılan
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns "
                        + "WHERE table_schema='public' AND table_name=? AND column_name=?",
                Integer.class, table, column);
        return count != null && count > 0;
    }

    private boolean tableExists(String table) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables "
                        + "WHERE table_schema='public' AND table_name=?",
                Integer.class, table);
        return count != null && count > 0;
    }
}
