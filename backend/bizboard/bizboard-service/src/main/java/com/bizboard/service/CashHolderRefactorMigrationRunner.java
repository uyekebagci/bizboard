package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * WP 2786a36e (Beta v1.1 · CASH_HOLDER Refactor): bank_accounts tablosuna
 * 3 yeni kolon (holder_name / holder_phone / holder_notes) ve eski
 * counterpart-link'li CASH_HOLDER kayıtları için backfill.
 *
 * <p>Hibernate ddl-auto kolonları kendisi ekler; biz idempotent backfill
 * yaparız — counterpart_id varsa ve holder_name NULL ise counterpart.name'i
 * holder_name'e kopyala.</p>
 *
 * <p>Counterpart kayıtları SİLİNMEZ — başka yerde kullanıyor olabilir
 * (debt, tx). holder_person_id kolonu da KALIR (backward compat).</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(18) // ClosureSession (17) sonrası
public class CashHolderRefactorMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            // 1) Defansif ADD COLUMN — Hibernate auto-DDL ekler ama prod'da
            //    nadiren skip ediyor; idempotent IF NOT EXISTS kullanılır.
            jdbc.execute("ALTER TABLE bank_accounts " +
                    "ADD COLUMN IF NOT EXISTS holder_name VARCHAR(200)");
            jdbc.execute("ALTER TABLE bank_accounts " +
                    "ADD COLUMN IF NOT EXISTS holder_phone VARCHAR(20)");
            jdbc.execute("ALTER TABLE bank_accounts " +
                    "ADD COLUMN IF NOT EXISTS holder_notes TEXT");

            // 2) Backfill: counterpart_id varsa ve holder_name boşsa kopyala.
            //    Idempotent — holder_name IS NULL guard ile re-run güvenli.
            int updated = jdbc.update(
                    "UPDATE bank_accounts ba " +
                    "SET holder_name = cp.name " +
                    "FROM counterparts cp " +
                    "WHERE ba.holder_person_id = cp.id " +
                    "  AND ba.type = 'CASH_HOLDER' " +
                    "  AND ba.holder_name IS NULL");
            if (updated > 0) {
                log.info("[cash-holder-refactor] backfilled holder_name for {} CASH_HOLDER row(s)",
                        updated);
            } else {
                log.debug("[cash-holder-refactor] backfill OK (no rows)");
            }
        } catch (Exception e) {
            log.error("[cash-holder-refactor] FAILED:", e);
        }
    }
}
