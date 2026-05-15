package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Startup-time tek-seferlik schema temizliği: {@code users.is_active} kolonunda
 * geçmiş sürümlerden kalma NULL değerleri TRUE'ya çeker.
 *
 * <p>Sebep: erken versiyonlarda {@code is_active} sütununa NOT NULL constraint
 * konmamıştı; bazı satırlarda NULL kalmış olabilir. v1.3.4'le birlikte
 * {@link com.bizboard.security.UserPrincipal#isEnabled()} bu alanı gerçek
 * yetkilendirme kararı olarak kullanmaya başladı; NULL → Java primitive
 * {@code boolean} false okunmakta, ve kullanıcı sistem dışı kalmakta. Bu da
 * mevcut kullanıcılar için "giriş yaptım ama her isteğe 403" semptomuyla
 * patladı (v1.4.0 deploy sonrası).</p>
 *
 * <p>Backfill idempotent — her startup'ta çalışır, etki olmadıysa UPDATE 0
 * satır günceller. v2.0.0 Flyway iş paketinde {@code is_active} sütununa
 * NOT NULL DEFAULT TRUE constraint'i kalıcı olarak eklenecek; bu sınıf o
 * sürümde silinebilir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UserActiveBackfill implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            int updated = jdbc.update("UPDATE users SET is_active = TRUE WHERE is_active IS NULL");
            if (updated > 0) {
                log.warn("[backfill] users.is_active NULL → TRUE: {} rows updated", updated);
            } else {
                log.info("[backfill] users.is_active: no NULL rows");
            }
        } catch (Exception e) {
            // Tablo henüz oluşmamış olabilir (ilk boot'ta Hibernate ddl-auto=update
            // henüz bitmiş olabilir mi?). Hata fatal değil, sadece logla.
            log.warn("[backfill] users.is_active backfill skipped: {}", e.getMessage());
        }
    }
}
