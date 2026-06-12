package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * v2.2.0 Advanced Search — pg_trgm GIN index'leri (DB-FTS optimizasyonu).
 *
 * <p>Arama repository'leri (bkz. {@code repository.search.*SearchRepository})
 * serbest-metin filtrelerini {@code LOWER(col) LIKE :term} ile yapar; {@code :term}
 * {@code %...%} (leading wildcard) pattern'idir → B-tree index'leri kullanamaz
 * (non-sargable). PostgreSQL'in {@code pg_trgm} GIN index'i bu {@code LIKE '%x%'}
 * kalıplarını hızlandırır.</p>
 *
 * <p><b>Sonuç-değiştirmez:</b> Index yalnız erişim yolu sağlar; arama sonuç
 * kümesini DEĞİŞTİRMEZ. Sorgular {@code LOWER(col)} kullandığı için index ifadesi
 * de {@code LOWER(col) gin_trgm_ops} olarak oluşturulur (planner'ın sorgu ifadesiyle
 * birebir eşleşmesi şart). Repository sorgularına dokunulmaz.</p>
 *
 * <p><b>İdempotent + non-fatal:</b> {@link PerfIndexMigrationRunner} desenini
 * izler — {@code CREATE EXTENSION/INDEX IF NOT EXISTS}, her startup'ta çalışır,
 * 2. boot tamamen no-op. Extension veya tek bir index başarısız olursa loglanır
 * ama boot DÜŞMEZ; diğer index'ler denenmeye devam eder.</p>
 *
 * <p><b>Defansif:</b> her index, hedef tablo + kolonun {@code information_schema}'da
 * gerçekten var olduğu doğrulandıktan SONRA denenir.</p>
 *
 * <p><b>unaccent:</b> extension idempotent kurulur (Türkçe aksan-duyarsız arama
 * için ileride kullanılabilir), ANCAK repository sorguları {@code unaccent()}
 * KULLANMAZ — mevcut arama sonuç davranışını değiştirmemek için. Aksan-duyarsız
 * eşleşme ayrı bir karardır (sonuç kümesini genişletir); bu WP yalnız pg_trgm ile
 * mevcut sonucu hızlandırır.</p>
 *
 * <p><b>Kapsam dışı (ayrı işler — AÇIK):</b> tsvector tam-metin search_vector
 * kolonu/trigger; RLS policy + SET LOCAL interceptor; k6 yük testi; Grafana
 * dashboard. Bunlar bilinçli olarak ertelendi.</p>
 *
 * <p>v2.0.0'da Flyway/Liquibase'e taşınınca bu runner silinir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(51) // PerfIndexMigrationRunner (50) ve tüm kolon/tablo migration'larından SONRA
public class SearchTrigramIndexMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    /**
     * Bir trigram GIN index tanımı. Her kayıt: index adı, tablo, hedef kolon
     * (var-existence doğrulaması + DDL için). Kolon adları DB'den
     * ({@code information_schema}) doğrulandı.
     */
    private record TrgmIndexDef(String name, String table, String column) {

        /**
         * {@code LOWER(col) gin_trgm_ops} ifade index'i. Repository sorguları
         * {@code LOWER(col) LIKE :term} kullandığı için ifade birebir eşleşmeli.
         */
        String ddl() {
            return "CREATE INDEX IF NOT EXISTS " + name +
                    " ON " + table + " USING gin (LOWER(" + column + ") gin_trgm_ops)";
        }
    }

    /**
     * Aranan metin kolonları (tüm {@code *SearchRepository}'lerin
     * {@code LOWER(col) LIKE} ile taradığı kolonlar). Join'lenen kolonlar
     * (ör. PaymentInstrument/PosDevice → counterpart.name) ilgili tablonun
     * kendi index'iyle karşılanır (counterparts.name) → tekrar eklenmez.
     */
    private static final List<TrgmIndexDef> INDEXES = List.of(
            // --- transactions ---
            new TrgmIndexDef("idx_trgm_tx_description", "transactions", "description"),

            // --- counterparts (cari) ---
            new TrgmIndexDef("idx_trgm_counterparts_name", "counterparts", "name"),
            new TrgmIndexDef("idx_trgm_counterparts_contact_name", "counterparts", "contact_name"),
            new TrgmIndexDef("idx_trgm_counterparts_contact_phone", "counterparts", "contact_phone"),
            new TrgmIndexDef("idx_trgm_counterparts_contact_email", "counterparts", "contact_email"),

            // --- debts (borç/alacak) ---
            new TrgmIndexDef("idx_trgm_debts_counterparty", "debts", "counterparty"),
            new TrgmIndexDef("idx_trgm_debts_description", "debts", "description"),

            // --- bank_accounts ---
            new TrgmIndexDef("idx_trgm_bank_accounts_name", "bank_accounts", "name"),
            new TrgmIndexDef("idx_trgm_bank_accounts_bank_name", "bank_accounts", "bank_name"),
            new TrgmIndexDef("idx_trgm_bank_accounts_holder_name", "bank_accounts", "holder_name"),

            // --- business_notes ---
            new TrgmIndexDef("idx_trgm_business_notes_content", "business_notes", "content"),

            // --- businesses ---
            new TrgmIndexDef("idx_trgm_businesses_name", "businesses", "name"),
            new TrgmIndexDef("idx_trgm_businesses_type_name", "businesses", "business_type_name"),

            // --- employees ---
            new TrgmIndexDef("idx_trgm_employees_full_name", "employees", "full_name"),
            new TrgmIndexDef("idx_trgm_employees_position", "employees", "position"),

            // --- business_groups (firma grubu) ---
            new TrgmIndexDef("idx_trgm_business_groups_name", "business_groups", "name"),

            // --- fixed_costs ---
            new TrgmIndexDef("idx_trgm_fixed_costs_name", "fixed_costs", "name"),
            new TrgmIndexDef("idx_trgm_fixed_costs_type", "fixed_costs", "type"),

            // --- inventory_items ---
            new TrgmIndexDef("idx_trgm_inventory_items_name", "inventory_items", "name"),
            new TrgmIndexDef("idx_trgm_inventory_items_sku", "inventory_items", "sku"),
            new TrgmIndexDef("idx_trgm_inventory_items_serial", "inventory_items", "serial_number"),
            new TrgmIndexDef("idx_trgm_inventory_items_brand", "inventory_items", "brand"),
            new TrgmIndexDef("idx_trgm_inventory_items_model", "inventory_items", "model"),
            new TrgmIndexDef("idx_trgm_inventory_items_category", "inventory_items", "category"),

            // --- my_companies ---
            new TrgmIndexDef("idx_trgm_my_companies_legal_name", "my_companies", "legal_name"),
            new TrgmIndexDef("idx_trgm_my_companies_trade_reg", "my_companies", "trade_registry_no"),

            // --- payment_instruments (çek/senet) ---
            new TrgmIndexDef("idx_trgm_payment_instr_cheque_no", "payment_instruments", "cheque_number"),
            new TrgmIndexDef("idx_trgm_payment_instr_drawer_bank", "payment_instruments", "drawer_bank"),
            new TrgmIndexDef("idx_trgm_payment_instr_drawer_branch", "payment_instruments", "drawer_branch"),
            new TrgmIndexDef("idx_trgm_payment_instr_note_serial", "payment_instruments", "note_serial"),
            new TrgmIndexDef("idx_trgm_payment_instr_description", "payment_instruments", "description"),

            // --- pos_devices ---
            new TrgmIndexDef("idx_trgm_pos_devices_name", "pos_devices", "name"),
            new TrgmIndexDef("idx_trgm_pos_devices_bank_name", "pos_devices", "bank_name"),

            // --- vehicles ---
            new TrgmIndexDef("idx_trgm_vehicles_plate", "vehicles", "plate_number"),
            new TrgmIndexDef("idx_trgm_vehicles_brand", "vehicles", "brand"),
            new TrgmIndexDef("idx_trgm_vehicles_model", "vehicles", "model")
    );

    @Override
    public void run(ApplicationArguments args) {
        log.info("[search-trgm-migration] pg_trgm GIN arama index kontrolü başlıyor...");

        // 1) Extension'lar (idempotent, non-fatal). pg_trgm GIN için ZORUNLU.
        boolean trgmReady = ensureExtension("pg_trgm");
        ensureExtension("unaccent"); // ileride aksan-duyarsız arama için; şimdi sorguda kullanılmaz.

        if (!trgmReady) {
            log.warn("[search-trgm-migration] pg_trgm extension yok/kurulamadı → GIN index'ler atlanıyor. "
                    + "Arama yine çalışır (LIKE seq-scan); index'ler bir sonraki boot'ta extension kurulunca eklenir.");
            return;
        }

        // 2) Trigram GIN index'leri ({} aday).
        log.info("[search-trgm-migration] {} trigram index adayı deneniyor...", INDEXES.size());
        int created = 0, skipped = 0, failed = 0;
        for (TrgmIndexDef def : INDEXES) {
            try {
                if (!tableExists(def.table())) {
                    log.warn("[search-trgm-migration] '{}' tablosu yok → '{}' atlandı.", def.table(), def.name());
                    skipped++;
                    continue;
                }
                if (!columnExists(def.table(), def.column())) {
                    log.warn("[search-trgm-migration] '{}.{}' kolonu yok → '{}' atlandı.",
                            def.table(), def.column(), def.name());
                    skipped++;
                    continue;
                }
                jdbc.execute(def.ddl()); // IF NOT EXISTS → idempotent (2. boot no-op)
                created++;
            } catch (Exception e) {
                // Non-fatal: boot'u düşürme; logla, diğer index'lere devam et.
                log.error("[search-trgm-migration] '{}' uygulanamadı (atlanıyor): {}", def.name(), e.getMessage());
                failed++;
            }
        }
        log.info("[search-trgm-migration] Tamamlandı — uygulanan/mevcut: {}, atlanan: {}, hatalı: {}.",
                created, skipped, failed);
    }

    /**
     * {@code CREATE EXTENSION IF NOT EXISTS} — idempotent + non-fatal.
     *
     * @return extension kurulu/oluşturulduysa true; aksi halde false.
     */
    private boolean ensureExtension(String name) {
        try {
            jdbc.execute("CREATE EXTENSION IF NOT EXISTS " + name);
            log.info("[search-trgm-migration] extension '{}' hazır.", name);
            return true;
        } catch (Exception e) {
            // Yetki yoksa (managed PG'de superuser gerekebilir) boot düşmesin.
            log.error("[search-trgm-migration] extension '{}' kurulamadı (atlanıyor): {}", name, e.getMessage());
            return false;
        }
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns " +
                        "WHERE table_schema='public' AND table_name=? AND column_name=?",
                Integer.class, table, column);
        return count != null && count > 0;
    }

    private boolean tableExists(String table) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables " +
                        "WHERE table_schema='public' AND table_name=?",
                Integer.class, table);
        return count != null && count > 0;
    }
}
