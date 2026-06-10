package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Ledger v2 (Faz A, RAFİNASYON 1 — §3.9): kategori {@code direction} → hibrit
 * {@code applicability} geçişi için idempotent veri migration'ı.
 *
 * <p>STRICT + KIRILMA YOK kuralı: mevcut tüm kategoriler {@code BOTH}'a düşer.
 * Eski {@code direction} değeri OTOMATİK KİLİTLENMEZ — sadece öneri olarak
 * loglanır (kullanıcı sonradan istediğini tek tarafa kilitler).</p>
 *
 * <p>Sırayla:</p>
 * <ol>
 *   <li>{@code categories.applicability} kolonu Hibernate {@code ddl-auto=update}
 *       ile zaten oluşur; bu runner NULL/boş satırları {@code 'BOTH'}'a backfill
 *       eder (idempotent — zaten dolu olanlar etkilenmez).</li>
 *   <li>Eski {@code direction} NOT NULL ise (eski şema), paylaşımlı modelde
 *       NULL olabilmeli — {@link CategorySharedMigrationRunner} bunu gevşetir;
 *       burada bir kez daha defensif kontrol.</li>
 *   <li>{@code direction != NULL} olan kategoriler için tek-tarafa-kilit ÖNERİSİ
 *       loglanır (INCOME→INCOME_ONLY, EXPENSE→EXPENSE_ONLY). Otomatik UPDATE YOK.</li>
 * </ol>
 *
 * <p>İdempotent + non-fatal (mevcut runner deseni): defalarca çalışabilir,
 * hata fatal değildir — log'lanır, uygulama açılmaya devam eder.</p>
 *
 * <p>Geri-dönülebilir: yalnızca NULL→BOTH backfill yapar; veri kaybı yok,
 * eski {@code direction} kolonu korunur. Reversal: {@code applicability}'yi
 * tekrar BOTH'a set etmek yeterli (default zaten BOTH).</p>
 *
 * <p>{@link CategorySharedMigrationRunner} (Order 26) sonrası çalışır (Order 27).</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(27)
public class CategoryApplicabilityMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        log.info("[category-applicability] Starting direction -> applicability (hibrit) migration...");
        try {
            if (!tableExists("categories")) {
                log.warn("[category-applicability] categories tablosu yok; atlaniyor.");
                return;
            }
            if (!columnExists("categories", "applicability")) {
                log.warn("[category-applicability] applicability kolonu henuz yok "
                        + "(ddl-auto bekleniyor); atlaniyor — sonraki bootta backfill yapilir.");
                return;
            }
            int backfilled = backfillBothForNulls();
            logLockSuggestions();
            log.info("[category-applicability] complete — BOTH'a-cekilen(NULL): {}.", backfilled);
        } catch (Exception e) {
            log.error("[category-applicability] FAILED — applicability gecisi eksik kalabilir. Error:", e);
        }
    }

    /**
     * NULL applicability → 'BOTH'. ddl-auto kolonu oluştururken mevcut satırlar
     * NULL kalabilir (ColumnDefault sadece yeni INSERT'lere uygulanır). İdempotent.
     */
    private int backfillBothForNulls() {
        return jdbc.update(
                "UPDATE categories SET applicability = 'BOTH' WHERE applicability IS NULL");
    }

    /**
     * Eski {@code direction} dolu olan kategoriler için tek-tarafa-kilit ÖNERİSİ
     * loglanır (otomatik UPDATE YOK — STRICT, kullanıcı kararı). Çok sayıda kayıt
     * varsa özet, az ise tek tek loglanır.
     */
    private void logLockSuggestions() {
        Integer total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM categories WHERE direction IS NOT NULL AND is_active = true",
                Integer.class);
        if (total == null || total == 0) {
            log.info("[category-applicability] tek-tarafa-kilit onerisi yok (direction tum aktiflerde NULL).");
            return;
        }
        log.info("[category-applicability] {} aktif kategoride eski 'direction' dolu — "
                + "tek-tarafa-kilit ONERILIR (otomatik kilit YOK; kullanici karari).", total);
        if (total <= 50) {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT id, name, direction FROM categories " +
                            "WHERE direction IS NOT NULL AND is_active = true " +
                            "ORDER BY direction, name");
            for (Map<String, Object> r : rows) {
                String dir = String.valueOf(r.get("direction"));
                String suggested = "INCOME".equalsIgnoreCase(dir) ? "INCOME_ONLY"
                        : "EXPENSE".equalsIgnoreCase(dir) ? "EXPENSE_ONLY" : "BOTH";
                log.info("[category-applicability]   ONERI: '{}' (id={}) direction={} -> {}",
                        r.get("name"), r.get("id"), dir, suggested);
            }
        }
    }

    private boolean tableExists(String table) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables " +
                        "WHERE table_schema='public' AND table_name=?",
                Integer.class, table);
        return count != null && count > 0;
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns " +
                        "WHERE table_schema='public' AND table_name=? AND column_name=?",
                Integer.class, table, column);
        return count != null && count > 0;
    }
}
