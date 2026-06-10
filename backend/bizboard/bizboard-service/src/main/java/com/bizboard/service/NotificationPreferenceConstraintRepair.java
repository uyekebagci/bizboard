package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Bug fix (notif-pref 500): {@code notification_preferences} tablosundaki ESKİ,
 * eksik enum CHECK constraint'lerini idempotent olarak düşürür.
 *
 * <p><b>Neden gerekli:</b> Prod {@code ddl-auto=update} ile çalışıyor (Flyway yok).
 * Hibernate, {@code @Enumerated(STRING)} kolonlar için tablo İLK oluşurken o anki
 * enum değerlerini bir CHECK constraint'e gömer. Enum'a sonradan yeni olay eklendiğinde
 * ({@code TAX_DEADLINE_DUE_SOON}, {@code LOW_STOCK}, {@code WARRANTY_EXPIRING},
 * {@code NEW_TRANSACTION}, {@code FIRM_ACCESS_GRANTED}) {@code update} modu mevcut
 * CHECK'i GÜNCELLEMEZ. Sonuç: bu olaylar için tercih kaydı insert'i eski CHECK'i ihlal
 * eder → {@code DataIntegrityViolationException} → istemciye 500 ("Beklenmeyen bir
 * sunucu hatası"). Üst 4 olay (eski CHECK'te zaten vardı) çalışmaya devam ederdi.</p>
 *
 * <p><b>Çözüm:</b> Enum geçerliliği Java tarafında zaten garanti (entity
 * {@code columnDefinition} ile yeni CHECK üretimini de engeller). Bu runner var olan
 * DB'lerdeki eski/eksik CHECK'i kalıcı olarak kaldırır; böylece tüm geçerli enum
 * değerleri insert edilebilir.</p>
 *
 * <p>İdempotent — her boot'ta çalışır, {@code DROP CONSTRAINT IF EXISTS} ile etki yoksa
 * no-op. Hata fatal değildir (tablo henüz oluşmamış olabilir); sadece loglanır.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(25) // BusinessNoteScopeBackfill (21) sonrası, diğer init'lerle çakışmaz
public class NotificationPreferenceConstraintRepair implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        dropConstraint("notification_preferences_event_check", "event");
        dropConstraint("notification_preferences_channel_check", "channel");
    }

    private void dropConstraint(String constraint, String column) {
        try {
            jdbc.execute(
                    "ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS " + constraint);
            log.info("[notif-pref-repair] eski enum CHECK kaldırıldı (varsa): {} ({} kolonu).",
                    constraint, column);
        } catch (Exception e) {
            log.warn("[notif-pref-repair] {} düşürme atlandı: {}", constraint, e.getMessage());
        }
    }
}
