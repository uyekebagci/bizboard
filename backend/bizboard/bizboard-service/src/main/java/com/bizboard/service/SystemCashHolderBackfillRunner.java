package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * BUG-3: sistem "Genel Nakit" ({@code is_system=true}, {@code CASH_HOLDER})
 * hesabını sahip olmayan MEVCUT işletmelere idempotent backfill eder.
 *
 * <p>Bağlam: yeni işletme oluşturulurken bu hesap yaratılmıyordu
 * ({@link BusinessService#createBusiness} artık seed ediyor — bkz. BUG-3 fix).
 * Ancak DAHA ÖNCE açılmış işletmelerde hesap eksik kalıyor; NAKIT (ve POS gelir)
 * tx'leri bank_account_id boş geldiğinde route edilecek konum hesabını
 * bulamıyor ({@link TransactionMutationService}/{@link LedgerPostingService}
 * fallback'leri {@code is_system && CASH_HOLDER} filtreler) → {@code account=NULL}
 * → posting türetilemiyor (FLAGGED) → gün-kapanışı/mutabakata girmiyordu.</p>
 *
 * <p><b>İdempotent:</b> zaten sistem CASH_HOLDER'ı olan işletme atlanır
 * ({@code WHERE NOT EXISTS}). <b>Non-fatal:</b> hata boot'u DÜŞÜRMEZ (try/catch
 * + log). Mevcut veri/satır DEĞİŞTİRİLMEZ — yalnız eksik hesap eklenir.</p>
 *
 * <p>Raw JDBC kullanılır (diğer runner deseni); JPA cascade/transaction
 * karmaşası yok. v2.0.0'da Flyway/Liquibase'e taşınınca silinir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(45) // CategoryRequired (25) + bank-type-check (14) sonrası; kolon/constraint hazır
public class SystemCashHolderBackfillRunner implements ApplicationRunner {

    private static final String GENEL_NAKIT = "Genel Nakit";

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            if (!tableExists("bank_accounts") || !tableExists("businesses")) {
                log.warn("[cash-holder-backfill] bank_accounts/businesses tablosu yok; atlaniyor.");
                return;
            }
            if (!columnExists("bank_accounts", "is_system")) {
                log.warn("[cash-holder-backfill] bank_accounts.is_system kolonu yok; atlaniyor "
                        + "(ddl-auto henuz uygulamamis olabilir).");
                return;
            }

            // Sistem CASH_HOLDER'ı OLMAYAN işletmeleri bul.
            List<Map<String, Object>> missing = jdbc.queryForList(
                    "SELECT b.id, b.name FROM businesses b " +
                            "WHERE NOT EXISTS (" +
                            "  SELECT 1 FROM bank_accounts ba " +
                            "  WHERE ba.business_id = b.id " +
                            "    AND ba.type = 'CASH_HOLDER' " +
                            "    AND ba.is_system = TRUE)");

            if (missing.isEmpty()) {
                log.debug("[cash-holder-backfill] Tum isletmelerde sistem 'Genel Nakit' var — no-op.");
                return;
            }

            int created = 0;
            for (Map<String, Object> row : missing) {
                Object businessId = row.get("id");
                try {
                    jdbc.update(
                            "INSERT INTO bank_accounts " +
                                    "(id, business_id, name, type, currency, current_balance, " +
                                    " is_active, is_system, created_at, updated_at) " +
                                    "VALUES (?, ?, ?, 'CASH_HOLDER', 'TRY', 0, TRUE, TRUE, NOW(), NOW())",
                            java.util.UUID.randomUUID(), businessId, GENEL_NAKIT);
                    created++;
                } catch (Exception ex) {
                    // Tek işletme hatası diğerlerini durdurmasın (örn. eşzamanlı seed race).
                    log.warn("[cash-holder-backfill] business={} icin 'Genel Nakit' eklenemedi (atlandi): {}",
                            businessId, ex.getMessage());
                }
            }
            log.info("[cash-holder-backfill] Sistem 'Genel Nakit' CASH_HOLDER eklendi: {} isletme.", created);
        } catch (Exception e) {
            // Boot'u DÜŞÜRME — sadece logla.
            log.error("[cash-holder-backfill] FAILED (boot devam ediyor):", e);
        }
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
