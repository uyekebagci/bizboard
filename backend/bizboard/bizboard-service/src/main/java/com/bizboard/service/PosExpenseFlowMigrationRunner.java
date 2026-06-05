package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * WP b446c696 (Beta v1.1 Hotfix · POS Gider Akışı):
 * <ul>
 *   <li>{@code pos_tx_subtype VARCHAR(10)} + CHECK (NAKIT|TRANSFER)</li>
 *   <li>{@code related_bank_account_id UUID} → bank_accounts(id)</li>
 *   <li>partial index pos_tx_subtype NOT NULL</li>
 * </ul>
 *
 * <p>Hibernate ddl-auto kolonu yarat ır; biz CHECK constraint + FK + index
 * için idempotent SQL çalıştırırız. CashHolderRefactor (18) sonrası.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(19)
public class PosExpenseFlowMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            // CHECK constraint — sadece NAKIT/TRANSFER kabul et (NULL serbest).
            // idempotent: önce drop sonra add (constraint adı sabit).
            jdbc.execute("ALTER TABLE transactions " +
                    "DROP CONSTRAINT IF EXISTS tx_pos_subtype_check");
            jdbc.execute("ALTER TABLE transactions " +
                    "ADD CONSTRAINT tx_pos_subtype_check " +
                    "CHECK (pos_tx_subtype IS NULL OR pos_tx_subtype IN ('NAKIT','TRANSFER'))");
            log.debug("[pos-expense-flow] CHECK constraint OK");
        } catch (Exception e) {
            log.error("[pos-expense-flow] CHECK constraint FAILED:", e);
        }

        try {
            // Hibernate ddl-auto FK koymayı atlayabilir — manuel kontrol.
            // information_schema ile mevcut FK varsa skip.
            Integer fkCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.table_constraints " +
                    "WHERE table_name='transactions' " +
                    "AND constraint_name='fk_tx_related_bank_account'",
                    Integer.class);
            if (fkCount != null && fkCount == 0) {
                jdbc.execute("ALTER TABLE transactions " +
                        "ADD CONSTRAINT fk_tx_related_bank_account " +
                        "FOREIGN KEY (related_bank_account_id) " +
                        "REFERENCES bank_accounts(id) ON DELETE SET NULL");
                log.debug("[pos-expense-flow] FK constraint added");
            } else {
                log.debug("[pos-expense-flow] FK constraint already present");
            }
        } catch (Exception e) {
            log.error("[pos-expense-flow] FK constraint FAILED:", e);
        }

        try {
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_tx_pos_subtype " +
                    "ON transactions(pos_tx_subtype) " +
                    "WHERE pos_tx_subtype IS NOT NULL");
            log.debug("[pos-expense-flow] partial index OK");
        } catch (Exception e) {
            log.error("[pos-expense-flow] index FAILED:", e);
        }
    }
}
