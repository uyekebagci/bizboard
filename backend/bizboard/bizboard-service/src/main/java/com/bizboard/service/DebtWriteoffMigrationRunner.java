package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * WP a9da4e9d (Beta v1.1 · Borç Silme): debt_writeoffs tablosu için
 * CHECK constraint + index'ler + ON DELETE CASCADE FK (Hibernate ddl-auto
 * eksikliklerini idempotent tamamlar).
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(16) // SubCashInclusion (15) sonrası
public class DebtWriteoffMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            // CHECK (amount > 0)
            if (!constraintExists("debt_writeoffs_amount_positive")) {
                log.info("[debt-writeoff-migration] Adding CHECK amount > 0...");
                jdbc.execute("ALTER TABLE debt_writeoffs " +
                        "ADD CONSTRAINT debt_writeoffs_amount_positive CHECK (amount > 0)");
            }
            // FK CASCADE (debt silinince writeoff'ı da temizle — referans bütünlüğü)
            recreateFkAsCascade("debt_writeoffs", "debt_id", "debts",
                    "debt_writeoffs_debt_fk");
            // Counterpart FK NO ACTION default OK (counterpart silinmesi nadir, daha sıkı)
            // Business FK NO ACTION default OK

            // 3 index
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_dw_counterpart " +
                    "ON debt_writeoffs(counterpart_id, written_off_at DESC)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_dw_debt " +
                    "ON debt_writeoffs(debt_id)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_dw_business " +
                    "ON debt_writeoffs(business_id, written_off_at DESC)");
            log.info("[debt-writeoff-migration] Constraints + indexes OK.");
        } catch (Exception e) {
            log.error("[debt-writeoff-migration] FAILED:", e);
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
            try { jdbc.execute("ALTER TABLE " + table + " DROP CONSTRAINT \"" + name + "\""); }
            catch (Exception e) { log.warn("[debt-writeoff-migration] Drop FK {} failed: {}", name, e.getMessage()); }
        }
        try {
            jdbc.execute(String.format(
                    "ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s(id) ON DELETE CASCADE",
                    table, fkName, column, refTable));
        } catch (Exception e) {
            log.warn("[debt-writeoff-migration] Add FK {} failed: {}", fkName, e.getMessage());
        }
    }

    private boolean constraintExists(String constraint) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pg_constraint WHERE conname = ?",
                Integer.class, constraint);
        return count != null && count > 0;
    }
}
