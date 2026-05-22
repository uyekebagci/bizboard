package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * v1.7.x WP fbb2ef55: Cari hesap & ödeme akışı için idempotent schema migration.
 *
 * <p>Hibernate auto-DDL prod'da mevcut row'lara NOT NULL kolonu ekleyemediği için
 * bu runner her startup'ta:</p>
 * <ol>
 *   <li>debts.remaining_amount ve debts.status varsa atla; yoksa NULLABLE olarak ekle.</li>
 *   <li>Mevcut row'larda NULL olanları backfill (remaining=amount, status='OPEN'
 *       veya is_settled=true ise 'PAID').</li>
 *   <li>Sonra kolonu NOT NULL'a ALTER et + CHECK constraint ekle.</li>
 *   <li>debt_payments ve payment_instruments tablolarını yoksa CREATE eder.</li>
 * </ol>
 *
 * <p>İdempotent: defalarca çalışabilir, mevcut state'i bozmaz.</p>
 *
 * <p>v2.0.0'da Flyway/Liquibase'e migrate edilecek; o noktada bu runner silinir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(10) // DefaultMyCompanyBootstrap ve benzeri öncesi
public class CariMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        log.info("[cari-migration] Starting WP fbb2ef55 schema migration check...");
        try {
            migrateDebts();
            createDebtPayments();
            createPaymentInstruments();
            log.info("[cari-migration] WP fbb2ef55 schema migration complete.");
        } catch (Exception e) {
            log.error("[cari-migration] FAILED — apps may misbehave. Error:", e);
        }
    }

    private void migrateDebts() {
        // 1) Kolonlar varsa atla
        boolean hasRemaining = columnExists("debts", "remaining_amount");
        boolean hasStatus = columnExists("debts", "status");

        if (!hasRemaining) {
            log.info("[cari-migration] Adding debts.remaining_amount (nullable)...");
            jdbc.execute("ALTER TABLE debts ADD COLUMN remaining_amount NUMERIC(15,2)");
        }
        if (!hasStatus) {
            log.info("[cari-migration] Adding debts.status (nullable)...");
            jdbc.execute("ALTER TABLE debts ADD COLUMN status VARCHAR(10)");
        }

        // 2) Backfill
        int updRem = jdbc.update("UPDATE debts SET remaining_amount = amount WHERE remaining_amount IS NULL");
        int updStat = jdbc.update("UPDATE debts SET status = CASE WHEN is_settled = true THEN 'PAID' ELSE 'OPEN' END WHERE status IS NULL");
        if (updRem > 0 || updStat > 0) {
            log.info("[cari-migration] Backfill — remaining_amount: {} rows, status: {} rows", updRem, updStat);
        }

        // 3) NOT NULL constraint (idempotent)
        try {
            jdbc.execute("ALTER TABLE debts ALTER COLUMN remaining_amount SET NOT NULL");
        } catch (Exception e) {
            log.debug("[cari-migration] remaining_amount NOT NULL already set or failed: {}", e.getMessage());
        }
        try {
            jdbc.execute("ALTER TABLE debts ALTER COLUMN status SET NOT NULL");
        } catch (Exception e) {
            log.debug("[cari-migration] status NOT NULL already set or failed: {}", e.getMessage());
        }
        try {
            jdbc.execute("ALTER TABLE debts ALTER COLUMN status SET DEFAULT 'OPEN'");
        } catch (Exception ignored) {}

        // 4) CHECK constraint'ler (idempotent — drop+add)
        try {
            jdbc.execute("ALTER TABLE debts DROP CONSTRAINT IF EXISTS debts_status_check");
            jdbc.execute("ALTER TABLE debts ADD CONSTRAINT debts_status_check " +
                    "CHECK (status IN ('OPEN','PARTIAL','PAID','CANCELLED'))");
        } catch (Exception e) {
            log.warn("[cari-migration] debts_status_check apply failed: {}", e.getMessage());
        }
        try {
            jdbc.execute("ALTER TABLE debts DROP CONSTRAINT IF EXISTS debts_remaining_check");
            jdbc.execute("ALTER TABLE debts ADD CONSTRAINT debts_remaining_check " +
                    "CHECK (remaining_amount >= 0 AND remaining_amount <= amount)");
        } catch (Exception e) {
            log.warn("[cari-migration] debts_remaining_check apply failed: {}", e.getMessage());
        }
    }

    private void createDebtPayments() {
        if (tableExists("debt_payments")) return;
        log.info("[cari-migration] Creating debt_payments table...");
        jdbc.execute("""
            CREATE TABLE debt_payments (
              id UUID PRIMARY KEY,
              business_id UUID NOT NULL REFERENCES businesses(id),
              counterpart_id UUID NOT NULL REFERENCES counterparts(id),
              debt_id UUID NULL REFERENCES debts(id),
              payment_direction VARCHAR(10) NOT NULL CHECK (payment_direction IN ('RECEIVED','PAID')),
              payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('NAKIT','HESAPDAN','CHEQUE','PROMISSORY_NOTE')),
              amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
              payment_date DATE NOT NULL,
              linked_transaction_id UUID NULL REFERENCES transactions(id),
              bank_account_id UUID NULL REFERENCES bank_accounts(id),
              linked_instrument_id UUID NULL,
              description TEXT,
              created_at TIMESTAMP DEFAULT NOW(),
              created_by UUID NULL REFERENCES users(id)
            )
        """);
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_dp_counterpart ON debt_payments(business_id, counterpart_id)");
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_dp_debt ON debt_payments(debt_id) WHERE debt_id IS NOT NULL");
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_dp_instrument ON debt_payments(linked_instrument_id) WHERE linked_instrument_id IS NOT NULL");
    }

    private void createPaymentInstruments() {
        if (tableExists("payment_instruments")) {
            // FK link belki eksiktir (önce debt_payments yarattıysak); ensure et
            ensureDebtPaymentInstrumentFk();
            return;
        }
        log.info("[cari-migration] Creating payment_instruments table...");
        jdbc.execute("""
            CREATE TABLE payment_instruments (
              id UUID PRIMARY KEY,
              business_id UUID NOT NULL REFERENCES businesses(id),
              counterpart_id UUID NOT NULL REFERENCES counterparts(id),
              instrument_type VARCHAR(20) NOT NULL CHECK (instrument_type IN ('CHEQUE','PROMISSORY_NOTE')),
              direction VARCHAR(10) NOT NULL CHECK (direction IN ('INCOMING','OUTGOING')),
              amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
              currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
              issue_date DATE NOT NULL,
              due_date DATE NOT NULL,
              cheque_number VARCHAR(50),
              drawer_bank VARCHAR(100),
              drawer_branch VARCHAR(100),
              note_serial VARCHAR(50),
              status VARCHAR(20) NOT NULL DEFAULT 'PORTFOLIO'
                CHECK (status IN ('PORTFOLIO','CLEARED','BOUNCED','CANCELLED')),
              cleared_at TIMESTAMP NULL,
              cleared_bank_account_id UUID NULL REFERENCES bank_accounts(id),
              bounced_at TIMESTAMP NULL,
              description TEXT,
              created_at TIMESTAMP DEFAULT NOW(),
              created_by UUID NULL REFERENCES users(id)
            )
        """);
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_pi_counterpart ON payment_instruments(business_id, counterpart_id)");
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_pi_status_due ON payment_instruments(business_id, status, due_date)");
        ensureDebtPaymentInstrumentFk();
    }

    private void ensureDebtPaymentInstrumentFk() {
        try {
            jdbc.execute("ALTER TABLE debt_payments DROP CONSTRAINT IF EXISTS fk_dp_instrument");
            jdbc.execute("ALTER TABLE debt_payments ADD CONSTRAINT fk_dp_instrument " +
                    "FOREIGN KEY (linked_instrument_id) REFERENCES payment_instruments(id)");
        } catch (Exception e) {
            log.debug("[cari-migration] fk_dp_instrument apply: {}", e.getMessage());
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
