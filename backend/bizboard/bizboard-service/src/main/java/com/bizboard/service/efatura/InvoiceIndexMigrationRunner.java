package com.bizboard.service.efatura;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * e-Fatura modülü: sıcak sorgu yolları için B-tree index'leri (idempotent).
 *
 * <p>Tablolar ({@code invoices}, {@code invoice_lines}) Hibernate
 * {@code ddl-auto=update} ile otomatik oluşur; bu runner yalnız okuma hızı için
 * index ekler — sonuç-değiştirmez, veriye dokunmaz.</p>
 *
 * <p>Mevcut {@code PerfIndexMigrationRunner} desenini izler: {@code CREATE INDEX
 * IF NOT EXISTS} (idempotent, 2. boot no-op), tablo/kolon var-existence
 * doğrulaması (information_schema), non-fatal try/catch (bir index başarısız
 * olursa boot DÜŞMEZ).</p>
 *
 * <p>{@code @Order(60)} — kolon/perf migration'larından sonra çalışır; tablolar
 * o noktada kesin oluşmuştur.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(60)
public class InvoiceIndexMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    private record IndexDef(String name, String table, List<String> columns, String ddl) {}

    private static final List<IndexDef> INDEXES = List.of(
            new IndexDef("idx_invoices_business_issue", "invoices",
                    List.of("business_id", "issue_date"),
                    "CREATE INDEX IF NOT EXISTS idx_invoices_business_issue " +
                            "ON invoices(business_id, issue_date DESC, created_at DESC)"),
            new IndexDef("idx_invoices_business_status", "invoices",
                    List.of("business_id", "status"),
                    "CREATE INDEX IF NOT EXISTS idx_invoices_business_status " +
                            "ON invoices(business_id, status)"),
            new IndexDef("idx_invoices_ettn", "invoices",
                    List.of("ettn"),
                    "CREATE INDEX IF NOT EXISTS idx_invoices_ettn ON invoices(ettn)"),
            new IndexDef("idx_invoices_customer_cp", "invoices",
                    List.of("customer_counterpart_id"),
                    "CREATE INDEX IF NOT EXISTS idx_invoices_customer_cp " +
                            "ON invoices(customer_counterpart_id) WHERE customer_counterpart_id IS NOT NULL"),
            new IndexDef("idx_invoice_lines_invoice", "invoice_lines",
                    List.of("invoice_id"),
                    "CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice " +
                            "ON invoice_lines(invoice_id)")
    );

    @Override
    public void run(ApplicationArguments args) {
        log.info("[efatura-index-migration] e-Fatura index check başlıyor ({} aday)...", INDEXES.size());
        int created = 0, skipped = 0, failed = 0;
        for (IndexDef def : INDEXES) {
            try {
                if (!tableExists(def.table())) {
                    log.warn("[efatura-index-migration] '{}' tablosu yok → '{}' atlandı.", def.table(), def.name());
                    skipped++;
                    continue;
                }
                String missing = firstMissingColumn(def.table(), def.columns());
                if (missing != null) {
                    log.warn("[efatura-index-migration] '{}.{}' kolonu yok → '{}' atlandı.",
                            def.table(), missing, def.name());
                    skipped++;
                    continue;
                }
                jdbc.execute(def.ddl()); // IF NOT EXISTS → idempotent
                created++;
            } catch (Exception e) {
                log.error("[efatura-index-migration] '{}' uygulanamadı (atlanıyor): {}", def.name(), e.getMessage());
                failed++;
            }
        }
        log.info("[efatura-index-migration] Tamamlandı — uygulanan/mevcut: {}, atlanan: {}, hatalı: {}.",
                created, skipped, failed);
    }

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
