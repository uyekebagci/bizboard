package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * WP a9da4e9d fix: {@code business_notes.scope} kolonu için idempotent startup
 * migration + backfill.
 *
 * <p><b>Neden gerekli:</b> Prod {@code ddl-auto=update} ile çalışıyor (Flyway yok).
 * Hibernate kolonu {@code DEFAULT 'BUSINESS'} ile ekler ve mevcut satırları doldurur,
 * ama bu sınıf üç senaryoyu da garantiler:</p>
 * <ul>
 *   <li><b>ddl-auto=update:</b> kolon zaten eklendi → {@code ADD COLUMN IF NOT EXISTS}
 *       no-op; backfill NULL kalan (varsa) satırları BUSINESS'a çeker.</li>
 *   <li><b>ddl-auto=validate (önerilen mod):</b> Hibernate kolonu EKLEMEZ ve şema
 *       uyumsuzluğunda uygulama AÇILMAZ. Bu runner Hibernate'ten ÖNCE değil sonra
 *       çalışır; ama validate modunda kolon manuel eklenmemişse uygulama zaten boot
 *       olmaz. Bu yüzden {@code ADD COLUMN IF NOT EXISTS} burada da güvenli bir ağ —
 *       validate'e geçilmeden önce kolon eklenmiş olur.</li>
 *   <li><b>Mevcut tüm notlar:</b> scope IS NULL olan her satır BUSINESS'a düşer
 *       (kullanıcının var olan işletme notları kaybolmaz, BUSINESS kümesinde kalır).</li>
 * </ul>
 *
 * <p>İdempotent — her boot'ta çalışır, etki yoksa 0 satır günceller. Hata fatal
 * değildir (tablo henüz oluşmamış olabilir); sadece loglanır.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(21) // SubCashBalanceRecompute (20) sonrası
public class BusinessNoteScopeBackfill implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            // 1) Kolon yoksa ekle (validate modu veya ddl-auto'nun atladığı durum için ağ).
            jdbc.execute(
                    "ALTER TABLE business_notes " +
                    "ADD COLUMN IF NOT EXISTS scope varchar(20) NOT NULL DEFAULT 'BUSINESS'");

            // 2) Mevcut NULL satırları BUSINESS'a çek (eski sürümden kalmış olabilir).
            int updated = jdbc.update(
                    "UPDATE business_notes SET scope = 'BUSINESS' WHERE scope IS NULL");
            if (updated > 0) {
                log.warn("[note-scope-backfill] business_notes.scope NULL → BUSINESS: {} satır.", updated);
            } else {
                log.info("[note-scope-backfill] business_notes.scope: NULL satır yok — no-op.");
            }
        } catch (Exception e) {
            log.warn("[note-scope-backfill] atlandı: {}", e.getMessage());
        }
    }
}
