package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * "Para İzi" (fund-trail): {@code fund_link} tablosu için Hibernate ddl-auto'nun
 * bırakmadığı CASCADE FK + UNIQUE'i kurar.
 *
 * <p>Hibernate {@code fund_link} tablosunu (+ source/target FK'leri RESTRICT
 * olarak) oluşturur; bu runner FK'leri {@code ON DELETE CASCADE}'e çevirir ki
 * bir işlem silindiğinde ona bağlı fon-bağları da silinsin (yetim metadata
 * kalmasın). Idempotent — constraint adına bakar; tablo henüz yoksa sessiz çıkar.</p>
 *
 * <p><b>NOT:</b> Bu yalnız şema (FK davranışı) — bakiye/P&L'e dair hiçbir veri
 * yazmaz.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(70)
public class FundLinkMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            if (!tableExists("fund_link")) {
                log.info("[fund-link-migration] fund_link tablosu yok (henüz) — atlanıyor.");
                return;
            }
            // Aynı (source, target) çiftine ikinci bağ engeli (servis ön-kontrol + DB safety).
            if (!constraintExists("uq_fund_link_source_target")) {
                try {
                    jdbc.execute("ALTER TABLE fund_link " +
                            "ADD CONSTRAINT uq_fund_link_source_target " +
                            "UNIQUE (source_transaction_id, target_transaction_id)");
                } catch (Exception e) {
                    log.warn("[fund-link-migration] UNIQUE eklenemedi: {}", e.getMessage());
                }
            }
            // FK'leri CASCADE'e çevir (tx silinince bağ da silinsin).
            recreateFkAsCascade("fund_link", "source_transaction_id", "transactions",
                    "fund_link_source_fk");
            recreateFkAsCascade("fund_link", "target_transaction_id", "transactions",
                    "fund_link_target_fk");
            // İndeksler (entity @Index zaten oluşturur; idempotent garanti).
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_fund_link_source ON fund_link(source_transaction_id)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_fund_link_target ON fund_link(target_transaction_id)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_fund_link_business ON fund_link(business_id)");
            log.info("[fund-link-migration] CASCADE FK + UNIQUE + index OK.");
        } catch (Exception e) {
            log.error("[fund-link-migration] FAILED:", e);
        }
    }

    private void recreateFkAsCascade(String table, String column, String refTable, String fkName) {
        if (constraintExists(fkName)) return;
        java.util.List<String> existing = jdbc.queryForList(
                "SELECT conname FROM pg_constraint c " +
                        "JOIN pg_class t ON c.conrelid = t.oid " +
                        "JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey) " +
                        "WHERE t.relname = ? AND a.attname = ? AND c.contype = 'f'",
                String.class, table, column);
        for (String name : existing) {
            try {
                jdbc.execute("ALTER TABLE " + table + " DROP CONSTRAINT \"" + name + "\"");
            } catch (Exception e) {
                log.warn("[fund-link-migration] Drop FK {} failed: {}", name, e.getMessage());
            }
        }
        try {
            jdbc.execute(String.format(
                    "ALTER TABLE %s ADD CONSTRAINT %s " +
                            "FOREIGN KEY (%s) REFERENCES %s(id) ON DELETE CASCADE",
                    table, fkName, column, refTable));
        } catch (Exception e) {
            log.warn("[fund-link-migration] Add FK {} failed: {}", fkName, e.getMessage());
        }
    }

    private boolean tableExists(String table) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables " +
                        "WHERE table_schema = 'public' AND table_name = ?",
                Integer.class, table);
        return count != null && count > 0;
    }

    private boolean constraintExists(String constraint) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pg_constraint WHERE conname = ?",
                Integer.class, constraint);
        return count != null && count > 0;
    }
}
