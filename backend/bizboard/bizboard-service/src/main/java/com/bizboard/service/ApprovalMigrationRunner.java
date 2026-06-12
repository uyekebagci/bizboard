package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Onay (Approval) modülü v1.1 — idempotent schema repair runner.
 *
 * <p>{@code approval_requests} tablosunu Hibernate auto-DDL ({@code ddl-auto:update})
 * entity'den yaratır; bu runner yalnız Hibernate'in atlayacağı işleri yapar:</p>
 * <ol>
 *   <li>{@code status} kolonuna CHECK constraint (enum değerleri) — idempotent
 *       drop+add. "Görünmez" geçersiz status'u DB seviyesinde de engeller.</li>
 * </ol>
 *
 * <p><b>İdempotent + non-fatal:</b> defalarca çalışabilir; tablo henüz yoksa
 * sessizce atlar (Hibernate aynı startup'ta yaratır — runner her açılışta tekrar
 * dener). Hata izole (başlatmayı bloklamaz).</p>
 *
 * <p>v2.0.0'da Flyway/Liquibase'e migrate edilince bu runner silinir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(60) // tüm kolon/tablo migration'larından SONRA (max mevcut @Order(50))
public class ApprovalMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            if (!tableExists("approval_requests")) {
                log.info("[approval-migration] approval_requests tablosu yok — "
                        + "Hibernate yaratacak; constraint repair sonraki açılışta uygulanır.");
                return;
            }
            applyStatusCheck();
            log.info("[approval-migration] approval_requests constraint repair tamam.");
        } catch (Exception e) {
            log.error("[approval-migration] FAILED (non-fatal):", e);
        }
    }

    private void applyStatusCheck() {
        try {
            jdbc.execute("ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_status_check");
            jdbc.execute("ALTER TABLE approval_requests ADD CONSTRAINT approval_status_check "
                    + "CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED'))");
        } catch (Exception e) {
            log.warn("[approval-migration] approval_status_check apply failed: {}", e.getMessage());
        }
    }

    private boolean tableExists(String table) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables "
                        + "WHERE table_schema='public' AND table_name=?",
                Integer.class, table);
        return count != null && count > 0;
    }
}
