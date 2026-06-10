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
 * Kategori ZORUNLU geçişi için idempotent schema + veri migration.
 *
 * <p>Flyway yok; Hibernate {@code ddl-auto=update} mevcut row'larda
 * {@code transactions.category_id}'yi NOT NULL yapamadığı için bu runner her
 * startup'ta sırayla:</p>
 * <ol>
 *   <li>Her {@code business} için tek seferlik PAYLAŞIMLI (yön-bağımsız) bir
 *       <b>"Diğer"</b> kategorisi oluşturur (yoksa). Bu kategori yalnız migration
 *       artefaktıdır; ileriye dönük kategoriler manuel oluşturulur.</li>
 *   <li>{@code category_id IS NULL} olan tüm transaction'ları kendi işletmesinin
 *       "Diğer" kategorisine atar (yön-bağımsız).</li>
 *   <li>Artık NULL kategorili tx kalmadıysa {@code category_id}'yi
 *       <b>NOT NULL</b>'a ALTER eder.</li>
 * </ol>
 *
 * <p>Not: Paylaşımlı kategori modeli ({@link CategorySharedMigrationRunner},
 * Order 26) eski yön-bazlı kategorileri birleştirip {@code direction}'ı NULL'a
 * çevirir. Bu runner artık business başına TEK "Diğer" (yön-bağımsız) garanti
 * eder; eski (direction'lı) "Diğer" kayıtları da isim-eşleşmesiyle dikkate
 * alınır, böylece restart'larda mükerrer oluşturulmaz.</p>
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
     * Her business için PAYLAŞIMLI (yön-bağımsız) tek bir "Diğer" kategorisi
     * garantile (idempotent). İsim-eşleşmesiyle (case-insensitive) hem aktif hem
     * pasif, hem eski direction'lı hem yeni NULL'lı "Diğer" kaydını dikkate alır;
     * herhangi biri varsa yeniden oluşturmaz (restart-loop'u önler).
     */
    private void ensureOtherCategories() {
        List<Map<String, Object>> businesses = jdbc.queryForList("SELECT id FROM businesses");
        int created = 0;
        for (Map<String, Object> row : businesses) {
            Object businessId = row.get("id");
            Integer existing = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM categories " +
                            "WHERE business_id = ? AND LOWER(name) = LOWER(?)",
                    Integer.class, businessId, OTHER_NAME);
            if (existing != null && existing > 0) {
                continue;
            }
            jdbc.update(
                    "INSERT INTO categories (id, business_id, name, direction, sort_order, is_active, created_at) " +
                            "VALUES (?, ?, ?, NULL, ?, ?, NOW())",
                    java.util.UUID.randomUUID(), businessId, OTHER_NAME, 9999, true);
            created++;
        }
        if (created > 0) {
            log.info("[category-migration] paylasimli '{}' kategorisi olusturuldu: {} adet (business).",
                    OTHER_NAME, created);
        }
    }

    /**
     * category_id IS NULL olan tx'leri kendi business'ının "Diğer" kategorisine
     * ata (paylaşımlı — yön-bağımsız). Aktif "Diğer" tercih edilir; aynı isimde
     * birden fazla varsa deterministik tek hedef seçilir.
     *
     * @return atanan tx sayısı
     */
    private int backfillNullCategories() {
        int updated = jdbc.update("""
                UPDATE transactions t
                SET category_id = (
                    SELECT c.id FROM categories c
                    WHERE c.business_id = t.business_id
                      AND LOWER(c.name) = LOWER(?)
                    ORDER BY c.is_active DESC, c.created_at ASC, c.id ASC
                    LIMIT 1
                )
                WHERE t.category_id IS NULL
                  AND EXISTS (
                    SELECT 1 FROM categories c
                    WHERE c.business_id = t.business_id
                      AND LOWER(c.name) = LOWER(?)
                  )
                """, OTHER_NAME, OTHER_NAME);
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
