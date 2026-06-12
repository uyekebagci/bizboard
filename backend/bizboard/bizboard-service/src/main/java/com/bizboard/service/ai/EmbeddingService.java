package com.bizboard.service.ai;

import com.bizboard.common.entity.AiEmbedding;
import com.bizboard.common.entity.Category;
import com.bizboard.common.entity.Transaction;
import com.bizboard.common.enums.AiEmbeddingKind;
import com.bizboard.common.enums.TransactionDirection;
import com.bizboard.repository.CategoryRepository;
import com.bizboard.repository.TransactionRepository;
import com.bizboard.repository.ai.AiEmbeddingRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

/**
 * AI modülü (v1.1): embedding pipeline — işletmenin finansal verisini
 * (işlem/kategori/aylık özet) doğal-dil metnine çevirir, embed eder ve
 * tenant-scope saklar; RAG retrieve için benzerlik araması yapar.
 *
 * <p><b>YENİ finansal hesap mantığı YOKTUR.</b> Yalnız mevcut Transaction/
 * Category verisini OKUYUP özetler (toplam/ortalama yalnız metin üretimi için;
 * defter/kasa hesapları DEĞİŞTİRİLMEZ).</p>
 *
 * <p><b>Graceful:</b> embedding sağlayıcı kapalıysa ({@code isAvailable()})
 * indeksleme no-op; pgvector yoksa retrieve in-memory kosinüs benzerliğine
 * düşer. Hiçbir durumda app çökmez.</p>
 *
 * <p><b>Tenant izolasyon:</b> tüm metotlar {@code businessId} ile çağrılır;
 * çağıran (servis/controller) guard'dan geçmiş olmalıdır. Repository
 * query'leri de business-filtreli (defense-in-depth).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmbeddingService {

    private final AiEmbeddingRepository embeddingRepository;
    private final TransactionRepository transactionRepository;
    private final CategoryRepository categoryRepository;
    private final EmbeddingProvider embeddingProvider;
    private final AiProperties props;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper = new ObjectMapper();

    /** Embedding sağlayıcı kullanılabilir mi (key + flag). */
    public boolean isAvailable() {
        return embeddingProvider.isAvailable();
    }

    // ───────────────────────── indexing ─────────────────────────

    /**
     * Bir işletmenin finansal verisini yeniden indeksler: mevcut embedding'leri
     * temizler, işlemleri + kategori özetlerini + son aylık özetleri embed eder.
     * Best-effort: sağlayıcı hatası non-fatal (loglanır, kısmi sonuç saklanır).
     *
     * @return saklanan embedding sayısı (0 = sağlayıcı kapalı / veri yok).
     */
    @Transactional
    public int reindexBusiness(UUID businessId) {
        if (!isAvailable()) {
            log.info("[ai-embed] sağlayıcı kapalı — reindex atlandı (business={})", businessId);
            return 0;
        }
        List<TextItem> items = buildCorpus(businessId);
        if (items.isEmpty()) {
            log.info("[ai-embed] indekslenecek veri yok (business={})", businessId);
            return 0;
        }
        embeddingRepository.deleteByBusinessId(businessId);

        int stored = 0;
        try {
            List<float[]> vectors = embeddingProvider.embed(
                    items.stream().map(TextItem::content).collect(Collectors.toList()));
            for (int i = 0; i < items.size() && i < vectors.size(); i++) {
                persist(businessId, items.get(i), vectors.get(i));
                stored++;
            }
        } catch (EmbeddingProvider.EmbeddingException e) {
            log.warn("[ai-embed] sağlayıcı hatası — kısmi/sıfır indeks (business={}): {}",
                    businessId, e.getMessage());
        }
        log.info("[ai-embed] reindex tamam — business={}, saklanan={}", businessId, stored);
        return stored;
    }

    private void persist(UUID businessId, TextItem item, float[] vector) {
        AiEmbedding emb = AiEmbedding.builder()
                .businessId(businessId)
                .sourceType(item.kind())
                .sourceId(item.sourceId())
                .content(item.content())
                .embeddingJson(toJson(vector))
                .provider(embeddingProvider.name())
                .model(embeddingProvider.model())
                .dimension(vector.length)
                .build();
        AiEmbedding saved = embeddingRepository.save(emb);
        syncNativeVector(saved.getId(), vector);
    }

    /**
     * pgvector mevcutsa native {@code embedding} kolonunu güncelle (JPA bu tipi
     * yönetmediği için raw UPDATE). pgvector yoksa no-op (JSON kolonu yeterli).
     */
    private void syncNativeVector(UUID id, float[] vector) {
        if (!EmbeddingMigrationRunner.isPgvectorAvailable()) return;
        try {
            jdbc.update("UPDATE ai_embeddings SET embedding = CAST(? AS vector) WHERE id = ?",
                    toPgVectorLiteral(vector), id);
        } catch (Exception e) {
            // Boyut uyumsuzluğu vb. — non-fatal; JSON fallback retrieve çalışır.
            log.debug("[ai-embed] native vector sync atlandı (id={}): {}", id, e.getMessage());
        }
    }

    // ───────────────────────── retrieval ─────────────────────────

    /**
     * Sorgu metnine en yakın {@code topK} embedding'i döner (RAG context).
     * pgvector varsa native ANN; yoksa in-memory kosinüs benzerliği. Tenant
     * filtreli. Sağlayıcı kapalıysa boş liste.
     */
    public List<AiEmbedding> retrieve(UUID businessId, String query, int topK) {
        if (!isAvailable()) return List.of();
        float[] qv;
        try {
            qv = embeddingProvider.embedOne(query);
        } catch (EmbeddingProvider.EmbeddingException e) {
            log.warn("[ai-embed] sorgu embed hatası: {}", e.getMessage());
            return List.of();
        }
        if (qv.length == 0) return List.of();

        if (EmbeddingMigrationRunner.isPgvectorAvailable()) {
            List<AiEmbedding> r = retrieveNative(businessId, qv, topK);
            if (!r.isEmpty()) return r;
            // native boş döndüyse (kolon henüz dolmamış olabilir) fallback.
        }
        return retrieveInMemory(businessId, qv, topK);
    }

    private List<AiEmbedding> retrieveNative(UUID businessId, float[] qv, int topK) {
        try {
            List<UUID> ids = embeddingRepository.findNearestIdsByPgvector(
                    businessId, toPgVectorLiteral(qv), topK);
            if (ids.isEmpty()) return List.of();
            // ID sırasını koruyarak entity'leri yükle.
            Map<UUID, AiEmbedding> byId = embeddingRepository.findAllById(ids).stream()
                    .collect(Collectors.toMap(AiEmbedding::getId, e -> e));
            List<AiEmbedding> ordered = new ArrayList<>();
            for (UUID id : ids) {
                AiEmbedding e = byId.get(id);
                // tenant doğrulaması (defense-in-depth).
                if (e != null && businessId.equals(e.getBusinessId())) ordered.add(e);
            }
            return ordered;
        } catch (Exception e) {
            log.warn("[ai-embed] native ANN başarısız, in-memory fallback: {}", e.getMessage());
            return List.of();
        }
    }

    private List<AiEmbedding> retrieveInMemory(UUID businessId, float[] qv, int topK) {
        List<AiEmbedding> all = embeddingRepository.findByBusinessId(businessId);
        return all.stream()
                .map(e -> Map.entry(e, cosine(qv, fromJson(e.getEmbeddingJson()))))
                .sorted(Map.Entry.<AiEmbedding, Double>comparingByValue().reversed())
                .limit(Math.max(1, topK))
                .map(Map.Entry::getKey)
                .collect(Collectors.toList());
    }

    // ───────────────────────── corpus building ─────────────────────────

    /** İşletmenin finansal verisini doğal-dil özet metinlerine çevirir. */
    private List<TextItem> buildCorpus(UUID businessId) {
        List<TextItem> items = new ArrayList<>();
        List<Transaction> txns = safeTransactions(businessId);

        // 1) Tek tek işlemler (son lookbackDays içindekiler — gürültü/maliyet dengesi).
        LocalDate since = LocalDate.now().minusDays(props.getAnomaly().getLookbackDays());
        for (Transaction t : txns) {
            if (t.getDate() != null && t.getDate().isBefore(since)) continue;
            items.add(new TextItem(AiEmbeddingKind.TRANSACTION, t.getId(), transactionText(t)));
        }

        // 2) Kategori özetleri (toplam akış — yalnız metin için aggregate).
        Map<String, BigDecimal[]> byCat = new LinkedHashMap<>(); // [income, expense]
        for (Transaction t : txns) {
            if (t.getAmount() == null) continue;
            String cat = t.getCategory() != null ? t.getCategory().getName() : "Kategorisiz";
            BigDecimal[] agg = byCat.computeIfAbsent(cat, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            if (t.getDirection() == TransactionDirection.INCOME) agg[0] = agg[0].add(t.getAmount());
            else agg[1] = agg[1].add(t.getAmount());
        }
        byCat.forEach((cat, agg) -> items.add(new TextItem(
                AiEmbeddingKind.CATEGORY_SUMMARY, null, categoryText(cat, agg[0], agg[1]))));

        // 3) Aylık özetler (son 6 ay).
        Map<YearMonth, BigDecimal[]> byMonth = new TreeMap<>();
        for (Transaction t : txns) {
            if (t.getAmount() == null || t.getDate() == null) continue;
            YearMonth ym = YearMonth.from(t.getDate());
            BigDecimal[] agg = byMonth.computeIfAbsent(ym, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            if (t.getDirection() == TransactionDirection.INCOME) agg[0] = agg[0].add(t.getAmount());
            else agg[1] = agg[1].add(t.getAmount());
        }
        byMonth.entrySet().stream()
                .sorted(Map.Entry.<YearMonth, BigDecimal[]>comparingByKey().reversed())
                .limit(6)
                .forEach(e -> items.add(new TextItem(
                        AiEmbeddingKind.MONTHLY_SUMMARY, null, monthlyText(e.getKey(), e.getValue()[0], e.getValue()[1]))));

        return items;
    }

    private List<Transaction> safeTransactions(UUID businessId) {
        try {
            return transactionRepository.findByBusinessIdOrderByDateDesc(businessId);
        } catch (Exception e) {
            log.warn("[ai-embed] işlem okuma hatası (business={}): {}", businessId, e.getMessage());
            return List.of();
        }
    }

    private String transactionText(Transaction t) {
        String dir = t.getDirection() == TransactionDirection.INCOME ? "gelir" : "gider";
        String cat = t.getCategory() != null ? t.getCategory().getName() : "kategorisiz";
        String desc = t.getDescription() != null && !t.getDescription().isBlank()
                ? " — " + t.getDescription() : "";
        String method = t.getPaymentMethod() != null ? t.getPaymentMethod() : "NAKIT";
        return String.format("%s tarihinde %s %s işlemi: %s %s, kategori: %s, ödeme: %s%s",
                t.getDate(), dir, t.getKind(), money(t.getAmount()), cur(t), cat, method, desc);
    }

    private String categoryText(String cat, BigDecimal income, BigDecimal expense) {
        BigDecimal net = income.subtract(expense);
        return String.format("Kategori özeti '%s': toplam gelir %s TL, toplam gider %s TL, net %s TL.",
                cat, money(income), money(expense), money(net));
    }

    private String monthlyText(YearMonth ym, BigDecimal income, BigDecimal expense) {
        BigDecimal net = income.subtract(expense);
        return String.format("%d-%02d ayı özeti: gelir %s TL, gider %s TL, net kâr/zarar %s TL.",
                ym.getYear(), ym.getMonthValue(), money(income), money(expense), money(net));
    }

    // ───────────────────────── vector utils ─────────────────────────

    private static double cosine(float[] a, float[] b) {
        if (a.length == 0 || b.length == 0 || a.length != b.length) return -1.0;
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        if (na == 0 || nb == 0) return -1.0;
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }

    private String toJson(float[] v) {
        try {
            return mapper.writeValueAsString(v);
        } catch (Exception e) {
            return "[]";
        }
    }

    private float[] fromJson(String json) {
        try {
            return mapper.readValue(json, float[].class);
        } catch (Exception e) {
            return new float[0];
        }
    }

    /** pgvector literal: '[0.1,0.2,...]' (operatör CAST ile vector'e çevirir). */
    private static String toPgVectorLiteral(float[] v) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < v.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(v[i]);
        }
        return sb.append(']').toString();
    }

    private static String money(BigDecimal v) {
        return (v == null ? BigDecimal.ZERO : v).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static String cur(Transaction t) {
        return t.getCurrency() != null ? t.getCurrency() : "TRY";
    }

    /** Korpus öğesi: kaynak türü + (varsa) kaynak id + embed edilecek metin. */
    private record TextItem(AiEmbeddingKind kind, UUID sourceId, String content) {}
}
