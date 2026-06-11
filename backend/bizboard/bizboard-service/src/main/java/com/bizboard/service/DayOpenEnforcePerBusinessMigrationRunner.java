package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Gün Açılışı enforcement bayrağını GLOBAL'den İŞLETME-BAŞINA'ya geçişin
 * idempotent + non-fatal boot temizliği.
 *
 * <p>Önceden enforcement {@code system_setting} içinde tek GLOBAL satır
 * ({@code setting_key = 'day_open.enforce_enabled'}) ile tutuluyordu; tek
 * işletmede açmak tüm işletmeleri (DGR dahil) etkiliyordu. Yeni model
 * işletme-başına: {@code day_open.enforce_enabled:<businessId>}. Per-business
 * okuma eski global satırı zaten OKUMAZ, ancak bu runner orphan global satırı
 * SİLER ki:</p>
 * <ul>
 *   <li>lingering bir global flag asla DGR'yi (ya da başka işletmeyi) etkileyemesin;</li>
 *   <li>operatör panelinde kafa karıştıran ölü kayıt kalmasın.</li>
 * </ul>
 *
 * <p><b>İdempotent:</b> satır yoksa no-op; varsa siler, tekrar çalışınca yine
 * no-op. <b>Non-fatal:</b> hata uygulamayı durdurmaz (mevcut runner deseni).
 * İşletme-başına satırlar ({@code ...:<businessId>}) DOKUNULMAZ. HER işletmede
 * default KAPALI (satır yokluğu = kapalı) — DGR dahil hiçbir işletme etkilenmez.</p>
 *
 * <p>v2.0.0'da Flyway/Liquibase'e taşınınca bu runner silinir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(40)
public class DayOpenEnforcePerBusinessMigrationRunner implements ApplicationRunner {

    /** Eski GLOBAL key — artık geçersiz; per-business key'lerle ({key}:{id}) karışmaz. */
    private static final String LEGACY_GLOBAL_KEY = LedgerFeatureFlagService.KEY_DAY_OPEN_ENFORCE;

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            if (!tableExists("system_setting")) {
                log.warn("[dayopen-enforce-perbiz] system_setting tablosu yok; atlaniyor.");
                return;
            }
            // Sadece TAM eşleşen eski global key silinir; per-business key'ler
            // ('day_open.enforce_enabled:<uuid>') ETKILENMEZ.
            int removed = jdbc.update(
                    "DELETE FROM system_setting WHERE setting_key = ?", LEGACY_GLOBAL_KEY);
            if (removed > 0) {
                log.info("[dayopen-enforce-perbiz] orphan GLOBAL enforcement key '{}' silindi "
                                + "(per-business modele gecis; DGR etkilenmez).",
                        LEGACY_GLOBAL_KEY);
            } else {
                log.info("[dayopen-enforce-perbiz] orphan global key yok; no-op (idempotent).");
            }
        } catch (Exception e) {
            log.error("[dayopen-enforce-perbiz] FAILED — orphan global enforcement key temizligi "
                    + "atlandi (non-fatal). Error:", e);
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
