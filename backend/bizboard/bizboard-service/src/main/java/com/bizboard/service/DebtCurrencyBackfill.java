package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * WP a9da4e9d (USD+Altın): debts.original_amount / rate_snapshot / rate_snapshot_at
 * için idempotent startup migration + backfill, ve ilk kur çekimi.
 *
 * <p>Prod {@code ddl-auto=update}. Bu runner: (1) kolonları {@code ADD COLUMN
 * IF NOT EXISTS} ile garantiler, (2) MEVCUT borçlar TRY kabul edilir →
 * original_amount = amount, rate_snapshot = 1 (rate_snapshot_at = created_at),
 * currency NULL ise 'TRY'. (3) İlk kur çekimini tetikler (cache boş kalmasın).
 * İdempotent; hata fatal değil.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(23)
public class DebtCurrencyBackfill implements ApplicationRunner {

    private final JdbcTemplate jdbc;
    private final ExchangeRateService exchangeRateService;

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE debts ADD COLUMN IF NOT EXISTS original_amount numeric(19,4)");
            jdbc.execute("ALTER TABLE debts ADD COLUMN IF NOT EXISTS rate_snapshot numeric(19,6)");
            jdbc.execute("ALTER TABLE debts ADD COLUMN IF NOT EXISTS rate_snapshot_at timestamp");

            // currency NULL/boş → 'TRY' (eski kayıtlar).
            jdbc.update("UPDATE debts SET currency = 'TRY' WHERE currency IS NULL OR currency = ''");
            // Mevcut hepsi TRY kabul: original = amount, rate = 1.
            int orig = jdbc.update(
                    "UPDATE debts SET original_amount = amount WHERE original_amount IS NULL");
            int rate = jdbc.update(
                    "UPDATE debts SET rate_snapshot = 1, rate_snapshot_at = created_at WHERE rate_snapshot IS NULL");
            log.info("[debt-currency-backfill] original_amount={} satır, rate_snapshot={} satır dolduruldu.", orig, rate);
        } catch (Exception e) {
            log.warn("[debt-currency-backfill] schema/backfill atlandı: {}", e.getMessage());
        }

        // WP a9da4e9d fix: currency_rates.code önceki deploy'da varchar(10) yaratıldıysa
        // GOLD_QUARTER (12 char) sığmaz. Hibernate update kolon uzunluğunu büyütmez →
        // idempotent ALTER ile 20'ye çıkar. Tablo henüz yoksa hata yutulur (sonra yaratılır).
        try {
            jdbc.execute("ALTER TABLE currency_rates ALTER COLUMN code TYPE varchar(20)");
        } catch (Exception e) {
            log.debug("[debt-currency-backfill] currency_rates.code ALTER atlandı: {}", e.getMessage());
        }

        // İlk kur çekimi — cache boşsa USD + altınlar doldurulsun (force).
        try {
            exchangeRateService.refresh(true);
        } catch (Exception e) {
            log.warn("[debt-currency-backfill] ilk kur çekimi atlandı: {}", e.getMessage());
        }
    }
}
