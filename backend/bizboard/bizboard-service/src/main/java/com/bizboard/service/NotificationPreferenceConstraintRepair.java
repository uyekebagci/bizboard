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
        dropConstraint("notification_preferences", "notification_preferences_event_check", "event");
        dropConstraint("notification_preferences", "notification_preferences_channel_check", "channel");
        // Tier 2 (EVT-1) + Tier 3 (EVT-2): telegram_chat_event_preferences (CHT-2)
        // event kolonu da enum-genişlemesinden etkilenebilir. Tablo columnDefinition
        // ile CHECK üretimini engelleyerek oluşturuldu (legacy CHECK olası değil), ama
        // yeni event ekleniyor (BALANCE_BELOW_THRESHOLD/HIGH_EXPENSE_ALERT — Tier 2;
        // WEEKLY_SUMMARY/MONTHLY_SUMMARY — Tier 3) — defansif olarak burada da varsa
        // eski CHECK'i düşürürüz (idempotent + non-fatal). Aynı drop notification_
        // preferences için yukarıda; yeni Tier 3 değerleri de o CHECK'i ihlal etmez.
        dropConstraint("telegram_chat_event_preferences",
                "telegram_chat_event_preferences_event_check", "event");
    }

    private void dropConstraint(String table, String constraint, String column) {
        try {
            jdbc.execute(
                    "ALTER TABLE " + table + " DROP CONSTRAINT IF EXISTS " + constraint);
            log.info("[notif-pref-repair] eski enum CHECK kaldırıldı (varsa): {}.{} ({} kolonu).",
                    table, constraint, column);
        } catch (Exception e) {
            log.warn("[notif-pref-repair] {}.{} düşürme atlandı: {}", table, constraint, e.getMessage());
        }
    }
}
