package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * WP 4b51cf42: refresh_tokens.session_started_at + last_used_at için idempotent
 * startup migration + backfill.
 *
 * <p>Prod {@code ddl-auto=update} (Flyway yok). Hibernate yeni kolonları ekler;
 * bu runner üç şeyi garantiler: (1) kolonlar yoksa {@code ADD COLUMN IF NOT EXISTS}
 * (validate moduna karşı ağ), (2) mevcut satırlarda NULL olanları {@code created_at}'e
 * çeker — eski oturumlar idle/absolute hesabında created_at baz alınır, (3) idempotent
 * (her boot, etki yoksa 0 satır). Hata fatal değil; loglanır.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(22)
public class RefreshTokenSessionBackfill implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS session_started_at timestamp");
            jdbc.execute("ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS last_used_at timestamp");

            int started = jdbc.update(
                    "UPDATE refresh_tokens SET session_started_at = created_at WHERE session_started_at IS NULL");
            int used = jdbc.update(
                    "UPDATE refresh_tokens SET last_used_at = created_at WHERE last_used_at IS NULL");
            if (started > 0 || used > 0) {
                log.warn("[rt-session-backfill] session_started_at={} satır, last_used_at={} satır created_at'ten dolduruldu.",
                        started, used);
            } else {
                log.info("[rt-session-backfill] NULL satır yok — no-op.");
            }
        } catch (Exception e) {
            log.warn("[rt-session-backfill] atlandı: {}", e.getMessage());
        }
    }
}
