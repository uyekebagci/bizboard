package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * WP e4dc5271 (Beta v1.4) TODO 57b377e5: Hızlı İşlemler şeması.
 *
 * <p>Hibernate ddl-auto=update tabloyu entity'den yaratır ama
 * unique constraint ve ON DELETE CASCADE FK'leri eksik bırakır.
 * Bu runner eksik parçaları idempotent şekilde tamamlar.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(13)
public class QuickActionMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            // 1) UNIQUE (user_id, business_id, name)
            if (!constraintExists("quick_actions_user_business_name_unique")) {
                log.info("[quick-actions-migration] Adding UNIQUE (user_id, business_id, name)...");
                jdbc.execute("ALTER TABLE quick_actions " +
                        "ADD CONSTRAINT quick_actions_user_business_name_unique " +
                        "UNIQUE (user_id, business_id, name)");
            }

            // 2) FK CASCADE on user_id ve business_id (Hibernate default ON DELETE NO ACTION
            //    yapıyor; spec ON DELETE CASCADE bekliyor)
            recreateFkAsCascade("quick_actions", "user_id", "users",
                    "quick_actions_user_fk");
            recreateFkAsCascade("quick_actions", "business_id", "businesses",
                    "quick_actions_business_fk");

            // 3) Performans index'leri
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_qa_user_business " +
                    "ON quick_actions(user_id, business_id, order_index)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_qa_last_used " +
                    "ON quick_actions(user_id, last_used_at DESC NULLS LAST)");

            log.info("[quick-actions-migration] Constraints + indexes OK.");
        } catch (Exception e) {
            log.error("[quick-actions-migration] FAILED:", e);
        }
    }

    /**
     * Hibernate'in yarattığı default FK'yi düşürüp ON DELETE CASCADE ile
     * yeniden ekler. İdempotent — bizim adlandırdığımız FK varsa no-op.
     */
    private void recreateFkAsCascade(String table, String column, String refTable, String fkName) {
        if (constraintExists(fkName)) {
            return; // zaten bizim CASCADE FK'miz var
        }
        // Hibernate'in default ismiyle (fkXXX) düşürmek için information_schema'dan
        // bu column üzerindeki FK'leri bul.
        java.util.List<String> existing = jdbc.queryForList(
                "SELECT conname FROM pg_constraint c " +
                        "JOIN pg_class t ON c.conrelid = t.oid " +
                        "JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey) " +
                        "WHERE t.relname = ? AND a.attname = ? AND c.contype = 'f'",
                String.class, table, column);
        for (String name : existing) {
            try {
                jdbc.execute("ALTER TABLE " + table + " DROP CONSTRAINT \"" + name + "\"");
                log.info("[quick-actions-migration] Dropped default FK {}", name);
            } catch (Exception e) {
                log.warn("[quick-actions-migration] Drop FK {} failed: {}", name, e.getMessage());
            }
        }
        try {
            jdbc.execute(String.format(
                    "ALTER TABLE %s ADD CONSTRAINT %s " +
                            "FOREIGN KEY (%s) REFERENCES %s(id) ON DELETE CASCADE",
                    table, fkName, column, refTable));
            log.info("[quick-actions-migration] Added FK {} with ON DELETE CASCADE", fkName);
        } catch (Exception e) {
            log.warn("[quick-actions-migration] Add FK {} failed: {}", fkName, e.getMessage());
        }
    }

    private boolean constraintExists(String constraint) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pg_constraint WHERE conname = ?",
                Integer.class, constraint);
        return count != null && count > 0;
    }
}
