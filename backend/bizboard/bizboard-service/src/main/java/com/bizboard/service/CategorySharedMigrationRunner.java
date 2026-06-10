package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Paylaşımlı (yön-bağımsız) kategori geçişi için idempotent veri migration'ı.
 *
 * <p>Eski model kategorileri per-business + per-direction (INCOME/EXPENSE)
 * tutuyordu; aynı kavram iki ayrı kategori olarak vardı (özellikle iki "Diğer").
 * Yeni model paylaşımlı: bir kategori hem gelir hem giderde kullanılır
 * ({@code categories.direction} = NULL). Bu runner her startup'ta sırayla:</p>
 * <ol>
 *   <li>Her {@code business} içinde AYNI İSİMLİ (case-insensitive) kategorileri
 *       TEK survivor'a birleştirir. Survivor seçimi deterministik: önce aktif,
 *       sonra en eski {@code created_at}, sonra en küçük id.</li>
 *   <li>Birleşen (duplicate) kategorilere bağlı {@code transactions.category_id}
 *       (ve {@code deleted_transaction_log.category_id}) değerlerini survivor'a
 *       REPOINT eder — kayıp/yetim tx olmaz.</li>
 *   <li>Repoint sonrası duplicate kategorileri pasifleştirir (soft-delete,
 *       {@code is_active=false}).</li>
 *   <li>Hayatta kalan TÜM kategorilerin {@code direction}'ını NULL'a (paylaşımlı)
 *       çevirir.</li>
 * </ol>
 *
 * <p>İdempotent: defalarca çalışabilir. Tekrar çalıştığında birleştirilecek
 * duplicate kalmaz (aktif tek isim) ve direction zaten NULL'dur → no-op.
 * Hata fatal değildir (mevcut runner deseni) — log'lanır, uygulama açılmaya
 * devam eder.</p>
 *
 * <p>{@link CategoryRequiredMigrationRunner} (Order 25) "Diğer" kategorilerini
 * ve NULL-kategori backfill'ini garanti ettikten SONRA çalışır (Order 26).</p>
 *
 * <p>v2.0.0'da Flyway/Liquibase'e taşınınca bu runner silinir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(26) // CategoryRequiredMigrationRunner (25) sonrası
public class CategorySharedMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        log.info("[category-shared] Starting shared (direction-independent) category migration...");
        try {
            if (!tableExists("categories") || !tableExists("transactions")) {
                log.warn("[category-shared] categories/transactions tablosu yok; atlaniyor.");
                return;
            }
            relaxDirectionNotNull();
            MergeStats stats = mergeDuplicatesPerBusiness();
            int sharedNow = makeAllShared();
            log.info("[category-shared] complete — birlesen-grup: {}, pasiflesen-duplicate: {}, "
                            + "repoint-tx: {}, repoint-log: {}, paylasimli-yapilan: {}.",
                    stats.mergedGroups, stats.deactivated, stats.repointedTx,
                    stats.repointedLog, sharedNow);
        } catch (Exception e) {
            log.error("[category-shared] FAILED — paylasimli kategori gecisi eksik kalabilir. Error:", e);
        }
    }

    /**
     * Paylaşımlı modelde {@code categories.direction} NULL olabilmeli.
     * Hibernate {@code ddl-auto=update} mevcut NOT NULL kısıtını gevşetmez;
     * elle DROP NOT NULL (idempotent — zaten nullable ise no-op).
     */
    private void relaxDirectionNotNull() {
        if (!isColumnNotNull("categories", "direction")) {
            return;
        }
        try {
            jdbc.execute("ALTER TABLE categories ALTER COLUMN direction DROP NOT NULL");
            log.info("[category-shared] categories.direction -> NULLABLE uygulandi.");
        } catch (Exception e) {
            log.warn("[category-shared] direction DROP NOT NULL basarisiz: {}", e.getMessage());
        }
    }

    /**
     * Her business içinde aynı isimli (case-insensitive) kategorileri tek
     * survivor'a birleştir; duplicate'lere bağlı tx/log'u survivor'a repoint et;
     * duplicate'leri pasifleştir.
     */
    private MergeStats mergeDuplicatesPerBusiness() {
        MergeStats stats = new MergeStats();
        boolean hasDeletedLog = tableExists("deleted_transaction_log");

        List<Map<String, Object>> businesses = jdbc.queryForList("SELECT id FROM businesses");
        for (Map<String, Object> bizRow : businesses) {
            Object businessId = bizRow.get("id");

            // Bu business'taki tüm kategoriler — isim grubuna göre.
            // Sıralama survivor seçimini deterministik kılar: aktif önce, eski önce.
            List<Map<String, Object>> cats = jdbc.queryForList(
                    "SELECT id, name, is_active, created_at FROM categories " +
                            "WHERE business_id = ? " +
                            "ORDER BY LOWER(name), is_active DESC, created_at ASC, id ASC",
                    businessId);

            Map<String, UUID> survivorByName = new LinkedHashMap<>();
            for (Map<String, Object> cat : cats) {
                String key = ((String) cat.get("name")).trim().toLowerCase();
                UUID catId = toUuid(cat.get("id"));

                UUID survivor = survivorByName.get(key);
                if (survivor == null) {
                    // İlk gördüğümüz (sıralama gereği en uygun) survivor olur.
                    survivorByName.put(key, catId);
                    continue;
                }
                if (survivor.equals(catId)) {
                    continue;
                }
                // catId bir duplicate — survivor'a repoint + pasifleştir.
                int tx = jdbc.update(
                        "UPDATE transactions SET category_id = ? WHERE category_id = ?",
                        survivor, catId);
                stats.repointedTx += tx;
                if (hasDeletedLog) {
                    int lg = jdbc.update(
                            "UPDATE deleted_transaction_log SET category_id = ? WHERE category_id = ?",
                            survivor, catId);
                    stats.repointedLog += lg;
                }
                int deactivated = jdbc.update(
                        "UPDATE categories SET is_active = false WHERE id = ? AND is_active = true",
                        catId);
                stats.deactivated += deactivated;
                stats.mergedGroups++; // her duplicate→survivor eşlemesi bir birleşme
            }
        }
        return stats;
    }

    /**
     * Hayatta kalan tüm kategorilerin direction'ını NULL'a (paylaşımlı) çevir.
     * İdempotent: zaten NULL olanlar etkilenmez.
     *
     * @return bu çalıştırmada paylaşımlıya çevrilen kategori sayısı
     */
    private int makeAllShared() {
        return jdbc.update("UPDATE categories SET direction = NULL WHERE direction IS NOT NULL");
    }

    private UUID toUuid(Object raw) {
        if (raw instanceof UUID u) return u;
        return UUID.fromString(String.valueOf(raw));
    }

    private boolean tableExists(String table) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables " +
                        "WHERE table_schema='public' AND table_name=?",
                Integer.class, table);
        return count != null && count > 0;
    }

    private boolean isColumnNotNull(String table, String column) {
        String nullable = jdbc.query(
                "SELECT is_nullable FROM information_schema.columns " +
                        "WHERE table_schema='public' AND table_name=? AND column_name=?",
                rs -> rs.next() ? rs.getString("is_nullable") : null,
                table, column);
        return "NO".equalsIgnoreCase(nullable);
    }

    /** Migration istatistikleri (log için). */
    private static final class MergeStats {
        int mergedGroups;
        int deactivated;
        int repointedTx;
        int repointedLog;
    }
}
