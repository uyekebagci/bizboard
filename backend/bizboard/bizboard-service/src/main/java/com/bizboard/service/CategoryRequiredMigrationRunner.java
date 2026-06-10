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
 * cat-be WP: kategori ZORUNLU geçişi için idempotent schema + veri migration.
 *
 * <p>Flyway yok; Hibernate {@code ddl-auto=update} mevcut row'larda
 * {@code transactions.category_id}'yi NOT NULL yapamadığı için bu runner her
 * startup'ta sırayla:</p>
 * <ol>
 *   <li>Her {@code (business_id, direction)} kombinasyonu için tek seferlik bir
 *       <b>"Diğer"</b> kategorisi oluşturur (yoksa). Bu kategori yalnız migration
 *       artefaktıdır; ileriye dönük kategoriler manuel oluşturulur.</li>
 *   <li>{@code category_id IS NULL} olan tüm transaction'ları kendi
 *       işletme + yönüne uygun "Diğer" kategorisine atar.</li>
 *   <li>Artık NULL kategorili tx kalmadıysa {@code category_id}'yi
 *       <b>NOT NULL</b>'a ALTER eder.</li>
 * </ol>
 *
 * <p>İdempotent: defalarca çalışabilir; "Diğer" tekrar oluşturulmaz, zaten
 * dolu tx'lere dokunulmaz. Hata fatal değildir (mevcut runner deseni) — log'lanır
 * ve uygulama açılmaya devam eder.</p>
 *
 * <p>v2.0.0'da Flyway/Liquibase'e taşınınca bu runner silinir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(25) // InventoryReorderBackfill (24) sonrası
public class CategoryRequiredMigrationRunner implements ApplicationRunner {

    private static final String OTHER_NAME = "Diğer";
    private static final String[] DIRECTIONS = {"INCOME", "EXPENSE"};

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        log.info("[category-migration] Starting cat-be required-category migration check...");
        try {
            if (!tableExists("categories") || !tableExists("transactions")) {
                log.warn("[category-migration] categories/transactions tablosu yok; atlaniyor.");
                return;
            }
            ensureOtherCategories();
            int reassigned = backfillNullCategories();
            enforceNotNull(reassigned);
            log.info("[category-migration] cat-be migration complete.");
        } catch (Exception e) {
            log.error("[category-migration] FAILED — kategori zorunlulugu eksik kalabilir. Error:", e);
        }
    }

    /**
     * Her business + her direction için bir "Diğer" kategorisi garantile (idempotent).
     * Hem aktif hem pasif "Diğer" kaydını dikkate alır (case-insensitive isim);
     * varsa yeniden oluşturmaz.
     */
    private void ensureOtherCategories() {
        List<Map<String, Object>> businesses = jdbc.queryForList("SELECT id FROM businesses");
        int created = 0;
        for (Map<String, Object> row : businesses) {
            Object businessId = row.get("id");
            for (String direction : DIRECTIONS) {
                Integer existing = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM categories " +
                                "WHERE business_id = ? AND direction = ? AND LOWER(name) = LOWER(?)",
                        Integer.class, businessId, direction, OTHER_NAME);
                if (existing != null && existing > 0) {
                    continue;
                }
                jdbc.update(
                        "INSERT INTO categories (id, business_id, name, direction, sort_order, is_active, created_at) " +
                                "VALUES (?, ?, ?, ?, ?, ?, NOW())",
                        java.util.UUID.randomUUID(), businessId, OTHER_NAME, direction, 9999, true);
                created++;
            }
        }
        if (created > 0) {
            log.info("[category-migration] '{}' kategorisi olusturuldu: {} adet (business x direction).",
                    OTHER_NAME, created);
        }
    }

    /**
     * category_id IS NULL olan tx'leri kendi business + direction'ına uygun
     * "Diğer" kategorisine ata. Aktif "Diğer" tercih edilir.
     *
     * @return atanan tx sayısı
     */
    private int backfillNullCategories() {
        int updated = jdbc.update("""
                UPDATE transactions t
                SET category_id = c.id
                FROM categories c
                WHERE t.category_id IS NULL
                  AND c.business_id = t.business_id
                  AND c.direction = t.direction
                  AND LOWER(c.name) = LOWER(?)
                """, OTHER_NAME);
        if (updated > 0) {
            log.info("[category-migration] NULL-kategorili {} tx '{}' kategorisine atandi.",
                    updated, OTHER_NAME);
        }
        return updated;
    }

    /**
     * category_id NOT NULL constraint'ini uygula — yalnız NULL kalan tx yoksa.
     * Aksi halde ALTER atlanır (uygulama açılışını engellememek için) + uyarı.
     */
    private void enforceNotNull(int reassigned) {
        Integer remaining = jdbc.queryForObject(
                "SELECT COUNT(*) FROM transactions WHERE category_id IS NULL", Integer.class);
        if (remaining != null && remaining > 0) {
            log.warn("[category-migration] Hala {} tx NULL kategorili; NOT NULL ALTER atlandi. " +
                    "(eslesen 'Diger' kategorisi bulunamamis olabilir)", remaining);
            return;
        }
        if (isColumnNotNull("transactions", "category_id")) {
            log.debug("[category-migration] transactions.category_id zaten NOT NULL.");
            return;
        }
        try {
            jdbc.execute("ALTER TABLE transactions ALTER COLUMN category_id SET NOT NULL");
            log.info("[category-migration] transactions.category_id -> NOT NULL uygulandi.");
        } catch (Exception e) {
            log.warn("[category-migration] category_id NOT NULL ALTER basarisiz: {}", e.getMessage());
        }
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
}
