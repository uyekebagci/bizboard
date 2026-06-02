package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * WP 08617251 (Beta v1.1 Closure Modülü): transactions.closure_session_id
 * için partial index (WHERE NOT NULL — yalnız session'a etiketli tx'leri
 * hızlı sorgu için). Hibernate ddl-auto kolonu kendisi ekler; biz index'i
 * idempotent ekleriz.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(17) // DebtWriteoff (16) sonrası
public class ClosureSessionMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_tx_closure_session " +
                    "ON transactions(closure_session_id) " +
                    "WHERE closure_session_id IS NOT NULL");
            log.debug("[closure-session-migration] index OK");
        } catch (Exception e) {
            log.error("[closure-session-migration] FAILED:", e);
        }
    }
}
