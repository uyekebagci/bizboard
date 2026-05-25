package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * WP Sub-Cash Retroactive Inclusion: sub_cash_tx_inclusion tablosu için
 * Hibernate ddl-auto'nun bırakmadığı UNIQUE + CASCADE FK + index'leri kurar.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(15) // QuickActionMigrationRunner (13) + BankAccountTypeCheckRepair (14) sonrası
public class SubCashInclusionMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            // Unique (sub_cash, transaction)
            if (!constraintExists("sub_cash_tx_inclusion_unique")) {
                log.info("[sub-cash-inclusion-migration] Adding UNIQUE (sub_cash, transaction)...");
                jdbc.execute("ALTER TABLE sub_cash_tx_inclusion " +
                        "ADD CONSTRAINT sub_cash_tx_inclusion_unique " +
                        "UNIQUE (sub_cash_bank_account_id, transaction_id)");
            }
            // Transaction FK → CASCADE (tx silinince inclusion da silinsin)
            recreateFkAsCascade("sub_cash_tx_inclusion", "transaction_id", "transactions",
                    "sub_cash_tx_inclusion_tx_fk");
            recreateFkAsCascade("sub_cash_tx_inclusion", "sub_cash_bank_account_id", "bank_accounts",
                    "sub_cash_tx_inclusion_sub_cash_fk");
            // Indexes
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_scti_sub_cash " +
                    "ON sub_cash_tx_inclusion(sub_cash_bank_account_id)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_scti_tx " +
                    "ON sub_cash_tx_inclusion(transaction_id)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_scti_scope " +
                    "ON sub_cash_tx_inclusion(sub_cash_bank_account_id, scope)");
            // Scope check constraint (defensive — enum string'leri sınırla)
            if (!constraintExists("sub_cash_tx_inclusion_scope_check")) {
                jdbc.execute("ALTER TABLE sub_cash_tx_inclusion " +
                        "ADD CONSTRAINT sub_cash_tx_inclusion_scope_check " +
                        "CHECK (scope IN ('AUTOMATIC','RETROACTIVE'))");
            }
            log.info("[sub-cash-inclusion-migration] Constraints + indexes OK.");
        } catch (Exception e) {
            log.error("[sub-cash-inclusion-migration] FAILED:", e);
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
                log.warn("[sub-cash-inclusion-migration] Drop FK {} failed: {}", name, e.getMessage());
            }
        }
        try {
            jdbc.execute(String.format(
                    "ALTER TABLE %s ADD CONSTRAINT %s " +
                            "FOREIGN KEY (%s) REFERENCES %s(id) ON DELETE CASCADE",
                    table, fkName, column, refTable));
        } catch (Exception e) {
            log.warn("[sub-cash-inclusion-migration] Add FK {} failed: {}", fkName, e.getMessage());
        }
    }

    private boolean constraintExists(String constraint) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pg_constraint WHERE conname = ?",
                Integer.class, constraint);
        return count != null && count > 0;
    }
}
