package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * v1.7.0.x: Notlar modülünü tüm mevcut işletmelere default enable eder.
 *
 * <p>İdempotent startup migration. Her business için
 * {@code business_modules(business_id, module='NOTES', is_enabled=true)}
 * satırı yoksa eklenir. Mevcut satır varsa dokunulmaz (kullanıcı manuel
 * pasifleştirmişse korunsun).</p>
 *
 * <p>Yeni işletmeler {@code BusinessService.create()} hook'unda zaten
 * NOTES'la birlikte yaratılıyor; bu runner sadece eski satırları kapsar.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(12) // FirmsMigrationRunner (11) sonrası
public class NotesModuleBackfillRunner implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            // Notlar modülü olmayan tüm işletmeleri bul ve ekle (tek SQL).
            int inserted = jdbc.update(
                    "INSERT INTO business_modules (id, business_id, module, is_enabled, created_at) " +
                    "SELECT gen_random_uuid(), b.id, 'NOTES', TRUE, NOW() " +
                    "FROM businesses b " +
                    "WHERE NOT EXISTS (" +
                    "  SELECT 1 FROM business_modules bm " +
                    "  WHERE bm.business_id = b.id AND bm.module = 'NOTES'" +
                    ")");
            if (inserted > 0) {
                log.info("[notes-backfill] {} business'a NOTES modülü eklendi.", inserted);
            } else {
                log.info("[notes-backfill] Tüm business'larda NOTES modülü mevcut — no-op.");
            }
        } catch (Exception e) {
            log.error("[notes-backfill] FAILED:", e);
        }
    }
}
