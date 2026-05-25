package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * v1.7.0.x (hotfix): {@code bank_accounts.type} check constraint repair.
 *
 * <p>Eski sürümlerden kalma constraint sadece {@code CHECKING/SAVINGS/CASH/CASH_HOLDER}
 * içeriyor olabilir; SUB_CASH ve MAIN_CASH eksik → kullanıcı alt kasa yaratamıyor.
 * Bu runner constraint'i okuyup eksik tipleri tespit ederse DROP + ADD ile
 * günceller. İdempotent — beş tipin tamamı varsa no-op.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(14) // diğer FirmsMigration + NotesBackfill + QuickAction sonrası
public class BankAccountTypeCheckRepairRunner implements ApplicationRunner {

    private static final String CONSTRAINT_NAME = "bank_accounts_type_check";
    private static final String[] REQUIRED_TYPES =
            { "CHECKING", "SAVINGS", "MAIN_CASH", "SUB_CASH", "CASH_HOLDER" };

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            String def = jdbc.query(
                    "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c " +
                            "JOIN pg_class t ON c.conrelid = t.oid " +
                            "WHERE t.relname = 'bank_accounts' AND c.conname = ?",
                    rs -> rs.next() ? rs.getString(1) : null,
                    CONSTRAINT_NAME);

            if (def == null) {
                log.info("[bank-type-check] Constraint yok — yeni ekleniyor.");
                addConstraint();
                return;
            }

            boolean missing = false;
            for (String t : REQUIRED_TYPES) {
                if (!def.contains("'" + t + "'")) {
                    missing = true;
                    log.info("[bank-type-check] Eksik tip tespit edildi: {}", t);
                }
            }
            if (!missing) {
                log.debug("[bank-type-check] Constraint tüm tipleri içeriyor — no-op.");
                return;
            }

            log.warn("[bank-type-check] Constraint güncelleniyor. Eski: {}", def);
            jdbc.execute("ALTER TABLE bank_accounts DROP CONSTRAINT " + CONSTRAINT_NAME);
            addConstraint();
            log.info("[bank-type-check] Constraint başarıyla güncellendi.");
        } catch (Exception e) {
            log.error("[bank-type-check] FAILED:", e);
        }
    }

    private void addConstraint() {
        jdbc.execute("ALTER TABLE bank_accounts ADD CONSTRAINT " + CONSTRAINT_NAME +
                " CHECK (type IN ('CHECKING', 'SAVINGS', 'MAIN_CASH', 'SUB_CASH', 'CASH_HOLDER'))");
    }
}
