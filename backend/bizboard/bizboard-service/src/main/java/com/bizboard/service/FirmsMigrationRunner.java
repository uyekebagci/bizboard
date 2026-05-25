package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * v1.7.x WP 8b961444 TODO ba04debb: Firmalarım (MyCompany) refactor — gruplar
 * + per-firm user access tabloları + my_companies.group_id kolonu.
 *
 * <p>İdempotent startup migration (Flyway/Liquibase eklenince silinir).</p>
 *
 * <p>Çatı'nın MyCompany entity'si business-scope'lu değil (Business →
 * MyCompany FK reverse), bu nedenle spec'teki {@code firm_groups.business_id}
 * yerine basit, tenant-wide bir grup modeli kullanılıyor.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(11) // CariMigrationRunner sonrası
public class FirmsMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        log.info("[firms-migration] Starting WP 8b961444 TODO ba04debb schema check...");
        try {
            createGroupsTable();
            createAccessTable();
            addGroupIdColumn();
            addPosDeviceOwnerMyCompanyColumn();
            addBankAccountOwnerMyCompanyColumn();
            log.info("[firms-migration] WP TODO ba04debb migration complete.");
        } catch (Exception e) {
            log.error("[firms-migration] FAILED:", e);
        }
    }

    private void createGroupsTable() {
        if (tableExists("my_company_groups")) return;
        log.info("[firms-migration] Creating my_company_groups...");
        jdbc.execute("""
            CREATE TABLE my_company_groups (
              id UUID PRIMARY KEY,
              name VARCHAR(120) NOT NULL,
              color VARCHAR(32),
              icon VARCHAR(48),
              order_index INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              created_by UUID NULL REFERENCES users(id),
              CONSTRAINT my_company_groups_name_unique UNIQUE (name)
            )
        """);
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_mcg_order ON my_company_groups(order_index, name)");
    }

    private void createAccessTable() {
        if (tableExists("my_company_user_access")) return;
        log.info("[firms-migration] Creating my_company_user_access...");
        jdbc.execute("""
            CREATE TABLE my_company_user_access (
              id UUID PRIMARY KEY,
              my_company_id UUID NOT NULL REFERENCES my_companies(id) ON DELETE CASCADE,
              user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
              granted_by UUID NULL REFERENCES users(id),
              CONSTRAINT my_company_user_access_unique UNIQUE (my_company_id, user_id)
            )
        """);
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_mcua_user ON my_company_user_access(user_id)");
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_mcua_company ON my_company_user_access(my_company_id)");
    }

    private void addGroupIdColumn() {
        if (columnExists("my_companies", "group_id")) return;
        log.info("[firms-migration] Adding my_companies.group_id...");
        jdbc.execute("ALTER TABLE my_companies ADD COLUMN group_id UUID");
        // ON DELETE SET NULL — grup silinirse firms 'gruplanmamış'a düşer.
        try {
            jdbc.execute("ALTER TABLE my_companies ADD CONSTRAINT my_companies_group_fk " +
                    "FOREIGN KEY (group_id) REFERENCES my_company_groups(id) ON DELETE SET NULL");
        } catch (Exception e) {
            log.warn("[firms-migration] group_id FK apply failed: {}", e.getMessage());
        }
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_my_companies_group ON my_companies(group_id) WHERE group_id IS NOT NULL");
    }

    /**
     * v1.7.0.x: bank_accounts.owner_my_company_id — banka hesabı kendi
     * firmamıza bağlanabilir. Mevcut satırlar NULL kalır (manuel atama).
     */
    private void addBankAccountOwnerMyCompanyColumn() {
        if (columnExists("bank_accounts", "owner_my_company_id")) return;
        log.info("[firms-migration] Adding bank_accounts.owner_my_company_id...");
        jdbc.execute("ALTER TABLE bank_accounts ADD COLUMN owner_my_company_id UUID");
        try {
            jdbc.execute("ALTER TABLE bank_accounts ADD CONSTRAINT bank_accounts_owner_my_company_fk " +
                    "FOREIGN KEY (owner_my_company_id) REFERENCES my_companies(id) ON DELETE SET NULL");
        } catch (Exception e) {
            log.warn("[firms-migration] bank_accounts.owner_my_company_id FK failed: {}", e.getMessage());
        }
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_bank_accounts_owner_mc " +
                "ON bank_accounts(owner_my_company_id) WHERE owner_my_company_id IS NOT NULL");
    }

    /** v1.7.x: pos_devices.owner_my_company_id — POS cihazı artık kendi firmamıza bağlanabilir. */
    private void addPosDeviceOwnerMyCompanyColumn() {
        if (columnExists("pos_devices", "owner_my_company_id")) return;
        log.info("[firms-migration] Adding pos_devices.owner_my_company_id...");
        jdbc.execute("ALTER TABLE pos_devices ADD COLUMN owner_my_company_id UUID");
        try {
            jdbc.execute("ALTER TABLE pos_devices ADD CONSTRAINT pos_devices_owner_my_company_fk " +
                    "FOREIGN KEY (owner_my_company_id) REFERENCES my_companies(id) ON DELETE SET NULL");
        } catch (Exception e) {
            log.warn("[firms-migration] owner_my_company_id FK failed: {}", e.getMessage());
        }
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_pos_devices_owner_mc " +
                "ON pos_devices(owner_my_company_id) WHERE owner_my_company_id IS NOT NULL");
    }

    private boolean tableExists(String table) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables " +
                        "WHERE table_schema='public' AND table_name=?",
                Integer.class, table);
        return count != null && count > 0;
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns " +
                        "WHERE table_schema='public' AND table_name=? AND column_name=?",
                Integer.class, table, column);
        return count != null && count > 0;
    }
}
