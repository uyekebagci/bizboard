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
 * Performans: sıcak sorgu yolları için B-tree index'leri (sonuç-değiştirmez).
 *
 * <p>Sadece okuma hızı içindir — hiçbir veriyi/hesabı değiştirmez. Index'ler
 * sorgu sonucunu değiştirmez, yalnız planner'a daha hızlı erişim yolu sunar.
 * Mevcut {@code *MigrationRunner} desenini izler (idempotent
 * {@code CREATE INDEX IF NOT EXISTS} + non-fatal try/catch).</p>
 *
 * <p><b>İdempotent:</b> her startup'ta çalışır; 2. boot tamamen no-op
 * (PostgreSQL {@code IF NOT EXISTS}). Bir index başarısız olursa loglanır ama
 * boot DÜŞMEZ — diğer index'ler denenmeye devam eder.</p>
 *
 * <p><b>Defansif:</b> her index, hedef tablo + kolonların gerçekten var
 * olduğunu {@code information_schema} ile doğruladıktan SONRA denenir. Yanlış
 * kolon adıyla index oluşturma girişimi yapılmaz (log uyarısı, atlanır).</p>
 *
 * <p>Tablo küçük olduğu için düz {@code CREATE INDEX} yeterli — CONCURRENTLY
 * gerekmez (CONCURRENTLY zaten transaction içinde çalışamaz). pg_trgm GIN
 * (arama) index'leri kapsam dışı; bu runner yalnız B-tree ekler.</p>
 *
 * <p>v2.0.0'da Flyway/Liquibase'e taşınınca bu runner silinir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(50) // tüm kolon/tablo migration'larından (max @Order(40)) SONRA — kolonlar kesin var
public class PerfIndexMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    /**
     * Eklenecek index'ler. Her kayıt: index adı, tablo, gerekli kolonlar
     * (var-existence doğrulaması için), tam DDL. Kolon adları entity'lerden
     * doğrulandı (bkz. Transaction/Debt/Counterpart/BankAccount/
     * SubCashAssignment/Posting).
     */
    private record IndexDef(String name, String table, List<String> columns, String ddl) {}

    private static final List<IndexDef> INDEXES = List.of(
            // --- transactions (sıcak finansal sorgular) ---
            new IndexDef("idx_tx_business_date", "transactions",
                    List.of("business_id", "date"),
                    "CREATE INDEX IF NOT EXISTS idx_tx_business_date " +
                            "ON transactions(business_id, date)"),
            new IndexDef("idx_tx_business_date_created", "transactions",
                    List.of("business_id", "date", "created_at"),
                    "CREATE INDEX IF NOT EXISTS idx_tx_business_date_created " +
                            "ON transactions(business_id, date DESC, created_at DESC)"),
            new IndexDef("idx_tx_bank_account_date", "transactions",
                    List.of("bank_account_id", "date"),
                    "CREATE INDEX IF NOT EXISTS idx_tx_bank_account_date " +
                            "ON transactions(bank_account_id, date) WHERE bank_account_id IS NOT NULL"),
            new IndexDef("idx_tx_pos_device_date", "transactions",
                    List.of("pos_device_id", "date"),
                    "CREATE INDEX IF NOT EXISTS idx_tx_pos_device_date " +
                            "ON transactions(pos_device_id, date) WHERE pos_device_id IS NOT NULL"),
            new IndexDef("idx_tx_target_counterpart", "transactions",
                    List.of("target_counterpart_id"),
                    "CREATE INDEX IF NOT EXISTS idx_tx_target_counterpart " +
                            "ON transactions(target_counterpart_id) WHERE target_counterpart_id IS NOT NULL"),
            new IndexDef("idx_tx_transfer_pair", "transactions",
                    List.of("transfer_pair_id"),
                    "CREATE INDEX IF NOT EXISTS idx_tx_transfer_pair " +
                            "ON transactions(transfer_pair_id) WHERE transfer_pair_id IS NOT NULL"),
            new IndexDef("idx_tx_unsettled_pos", "transactions",
                    List.of("business_id", "date", "payment_method", "pos_settled"),
                    "CREATE INDEX IF NOT EXISTS idx_tx_unsettled_pos " +
                            "ON transactions(business_id, date) " +
                            "WHERE payment_method='POS' AND (pos_settled IS NULL OR pos_settled=false)"),

            // --- debts (cari / borç sorguları). Settled kolonu DB'de is_settled. ---
            new IndexDef("idx_debts_counterpart", "debts",
                    List.of("counterpart_id"),
                    "CREATE INDEX IF NOT EXISTS idx_debts_counterpart " +
                            "ON debts(counterpart_id)"),
            new IndexDef("idx_debts_business_created", "debts",
                    List.of("business_id", "created_at"),
                    "CREATE INDEX IF NOT EXISTS idx_debts_business_created " +
                            "ON debts(business_id, created_at)"),
            new IndexDef("idx_debts_business_dir_settled", "debts",
                    List.of("business_id", "direction", "is_settled"),
                    "CREATE INDEX IF NOT EXISTS idx_debts_business_dir_settled " +
                            "ON debts(business_id, direction, is_settled)"),
            new IndexDef("idx_debts_cheque_due", "debts",
                    List.of("cheque_due_date", "is_settled"),
                    "CREATE INDEX IF NOT EXISTS idx_debts_cheque_due " +
                            "ON debts(cheque_due_date) WHERE is_settled=false"),
            new IndexDef("idx_debts_reminder", "debts",
                    List.of("reminder_date", "is_settled"),
                    "CREATE INDEX IF NOT EXISTS idx_debts_reminder " +
                            "ON debts(reminder_date) WHERE is_settled=false"),

            // --- counterparts ---
            new IndexDef("idx_counterparts_business_name", "counterparts",
                    List.of("business_id", "name"),
                    "CREATE INDEX IF NOT EXISTS idx_counterparts_business_name " +
                            "ON counterparts(business_id, name)"),
            new IndexDef("idx_counterparts_parent", "counterparts",
                    List.of("parent_id"),
                    "CREATE INDEX IF NOT EXISTS idx_counterparts_parent " +
                            "ON counterparts(parent_id) WHERE parent_id IS NOT NULL"),

            // --- bank_accounts. Active kolonu DB'de is_active. ---
            new IndexDef("idx_bank_accounts_business_active", "bank_accounts",
                    List.of("business_id", "is_active"),
                    "CREATE INDEX IF NOT EXISTS idx_bank_accounts_business_active " +
                            "ON bank_accounts(business_id, is_active)"),

            // --- sub_cash_assignments ---
            new IndexDef("idx_sca_sub_cash", "sub_cash_assignments",
                    List.of("sub_cash_id"),
                    "CREATE INDEX IF NOT EXISTS idx_sca_sub_cash " +
                            "ON sub_cash_assignments(sub_cash_id)"),
            new IndexDef("idx_sca_business", "sub_cash_assignments",
                    List.of("business_id"),
                    "CREATE INDEX IF NOT EXISTS idx_sca_business " +
                            "ON sub_cash_assignments(business_id)"),

            // --- postings (ledger v2) ---
            new IndexDef("idx_posting_je_legkind", "postings",
                    List.of("journal_entry_id", "leg_kind"),
                    "CREATE INDEX IF NOT EXISTS idx_posting_je_legkind " +
                            "ON postings(journal_entry_id, leg_kind)")
    );

    @Override
    public void run(ApplicationArguments args) {
        log.info("[perf-index-migration] B-tree perf index check başlıyor ({} aday)...", INDEXES.size());
        int created = 0, skipped = 0, failed = 0;
        for (IndexDef def : INDEXES) {
            try {
                if (!tableExists(def.table())) {
                    log.warn("[perf-index-migration] '{}' tablosu yok → '{}' atlandı.", def.table(), def.name());
                    skipped++;
                    continue;
                }
                String missing = firstMissingColumn(def.table(), def.columns());
                if (missing != null) {
                    log.warn("[perf-index-migration] '{}.{}' kolonu yok → '{}' atlandı.",
                            def.table(), missing, def.name());
                    skipped++;
                    continue;
                }
                jdbc.execute(def.ddl()); // IF NOT EXISTS → idempotent (2. boot no-op)
                created++;
            } catch (Exception e) {
                // Non-fatal: boot'u düşürme; logla, diğer index'lere devam et.
                log.error("[perf-index-migration] '{}' uygulanamadı (atlanıyor): {}", def.name(), e.getMessage());
                failed++;
            }
        }
        log.info("[perf-index-migration] Tamamlandı — uygulanan/mevcut: {}, atlanan: {}, hatalı: {}.",
                created, skipped, failed);
    }

    /** Verilen kolonlardan ilk eksik olanı döner; hepsi varsa null. */
    private String firstMissingColumn(String table, List<String> columns) {
        for (String col : columns) {
            if (!columnExists(table, col)) return col;
        }
        return null;
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
