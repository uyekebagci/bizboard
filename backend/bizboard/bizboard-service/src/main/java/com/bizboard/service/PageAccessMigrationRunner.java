package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Kullanıcı-bazlı sidebar SAYFA erişimi — {@code users.allowed_pages} kolonu.
 *
 * <p>İdempotent startup migration (Flyway/Liquibase eklenince silinir). Kolon
 * yoksa eklenir; varsa atlanır. {@code allowed_pages} {@code null} kalır →
 * uygulama katmanı NULL/boş'u "tüm sayfalar" (default-permissive) olarak yorumlar,
 * dolayısıyla MEVCUT kullanıcılar ETKİLENMEZ (kısıtlama opt-in).</p>
 *
 * @see com.bizboard.common.entity.User#getAllowedPages()
 * @see com.bizboard.service.PageAccessService
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(12) // FirmsMigrationRunner (Order 11) sonrası
public class PageAccessMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            if (columnExists("users", "allowed_pages")) {
                log.info("[page-access-migration] users.allowed_pages already present — skip");
                return;
            }
            log.info("[page-access-migration] Adding users.allowed_pages (TEXT, nullable)...");
            // NULL = default-permissive (tüm sayfalar). Mevcut satırlar NULL kalır.
            jdbc.execute("ALTER TABLE users ADD COLUMN allowed_pages TEXT");
            log.info("[page-access-migration] users.allowed_pages added.");
        } catch (Exception e) {
            // Tablo henüz oluşmamış olabilir (ilk boot, ddl-auto=update yarışı) —
            // fatal değil; sonraki startup'ta tekrar denenir.
            log.warn("[page-access-migration] skipped/failed (non-fatal): {}", e.getMessage());
        }
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns " +
                        "WHERE table_schema='public' AND table_name=? AND column_name=?",
                Integer.class, table, column);
        return count != null && count > 0;
    }
}
