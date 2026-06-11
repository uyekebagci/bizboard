package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * v1.7.0.x (hotfix): {@code transactions.kind} check constraint repair.
 *
 * <p>Eski sürümlerden kalma constraint sadece {@code NORMAL/TRANSFER}
 * içeriyor olabilir (örn. {@code kind IN ('NORMAL','TRANSFER')}). Koda
 * {@link com.bizboard.common.enums.TransactionKind#LOAN} (borç-transfer)
 * eklendi, ancak {@code ddl-auto=update} mevcut CHECK constraint'ini
 * GÜNCELLEMEZ → her LOAN insert (ve PaymentService cari TAHSİLAT/ÖDEME)
 * <b>409 "veri butunlugu kisitlamasi"</b> ile düşüyor; borç-transfer canlıda
 * işlevsiz.</p>
 *
 * <p>Bu runner {@code kind} kolonu üzerindeki CHECK constraint'ini
 * {@code information_schema} / {@code pg_constraint} üzerinden adıyla bağımsız
 * tespit eder; LOAN eksikse DROP + ADD ile günceller. ROBUST: constraint adı
 * farklı olabilir (Hibernate varsayılanı {@code transactions_kind_check}), satır
 * verisine DOKUNULMAZ, hata boot'u DÜŞÜRMEZ (try/catch + log), tekrar koşmada
 * no-op (idempotent — üç değerin tamamı varsa hiçbir şey yapmaz).</p>
 *
 * <p>Not: {@code bank_accounts.type} CHECK onarımı ayrı bir runner'da
 * ({@link BankAccountTypeCheckRepairRunner}). Bu runner yalnız {@code kind} ile
 * ilgilenir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(40) // tüm kolon/tablo migration'larından sonra (kind kolonu kesin var)
public class TransactionKindCheckRepairRunner implements ApplicationRunner {

    private static final String TABLE = "transactions";
    private static final String COLUMN = "kind";
    private static final String DEFAULT_CONSTRAINT_NAME = "transactions_kind_check";
    private static final String[] REQUIRED_KINDS = { "NORMAL", "TRANSFER", "LOAN" };

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            // 1) kind kolonu üzerindeki CHECK constraint'i adıyla bağımsız bul.
            //    Bir constraint'in "kind" CHECK'i olması için tanımında "kind"
            //    geçmeli (ör: ((kind)::text = ANY ...)). pg_get_constraintdef ile
            //    okunabilir tanımı alıp adıyla eşleriz.
            ConstraintInfo info = findKindCheckConstraint();

            if (info == null) {
                log.info("[tx-kind-check] {} kolonu için CHECK constraint yok — yeni ekleniyor.", COLUMN);
                addConstraint(DEFAULT_CONSTRAINT_NAME);
                log.info("[tx-kind-check] Constraint eklendi: {}", DEFAULT_CONSTRAINT_NAME);
                return;
            }

            boolean missing = false;
            for (String k : REQUIRED_KINDS) {
                if (!info.def.contains("'" + k + "'")) {
                    missing = true;
                    log.info("[tx-kind-check] Eksik kind tespit edildi: {}", k);
                }
            }
            if (!missing) {
                log.debug("[tx-kind-check] Constraint '{}' tüm kind değerlerini içeriyor — no-op.", info.name);
                return;
            }

            log.warn("[tx-kind-check] Constraint '{}' güncelleniyor. Eski tanım: {}", info.name, info.def);
            // DROP IF EXISTS — tespit edilen gerçek adı kullan; idempotent.
            jdbc.execute("ALTER TABLE " + TABLE + " DROP CONSTRAINT IF EXISTS " + info.name);
            addConstraint(info.name);
            log.info("[tx-kind-check] Constraint '{}' başarıyla güncellendi (NORMAL, TRANSFER, LOAN).", info.name);
        } catch (Exception e) {
            // Boot'u DÜŞÜRME — sadece logla.
            log.error("[tx-kind-check] FAILED (boot devam ediyor):", e);
        }
    }

    /**
     * {@code transactions.kind} kolonu üzerindeki CHECK constraint'ini adıyla
     * bağımsız bulur. Önce varsayılan ada bakar; bulunamazsa tablodaki tüm CHECK
     * constraint'lerini tarayıp tanımında {@code kind} geçen ilkini döner.
     */
    private ConstraintInfo findKindCheckConstraint() {
        // Hızlı yol: varsayılan ad.
        String def = jdbc.query(
                "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c " +
                        "JOIN pg_class t ON c.conrelid = t.oid " +
                        "WHERE t.relname = ? AND c.conname = ? AND c.contype = 'c'",
                rs -> rs.next() ? rs.getString(1) : null,
                TABLE, DEFAULT_CONSTRAINT_NAME);
        if (def != null) {
            return new ConstraintInfo(DEFAULT_CONSTRAINT_NAME, def);
        }

        // Robust yol: tablodaki tüm CHECK constraint'lerini tara, tanımında
        // "kind" geçeni (ör. ((kind)::text = ANY ...)) bul.
        return jdbc.query(
                "SELECT c.conname, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c " +
                        "JOIN pg_class t ON c.conrelid = t.oid " +
                        "WHERE t.relname = ? AND c.contype = 'c'",
                rs -> {
                    while (rs.next()) {
                        String name = rs.getString("conname");
                        String d = rs.getString("def");
                        // Yalnız kind ile ilgili CHECK; transfer_pair_id eşdeğerlik
                        // constraint'i gibi başka kind içeren tanımlardan kaçınmak
                        // için NORMAL/TRANSFER literal'lerini de ararız.
                        if (d != null
                                && d.contains("kind")
                                && (d.contains("'NORMAL'") || d.contains("'TRANSFER'"))) {
                            return new ConstraintInfo(name, d);
                        }
                    }
                    return null;
                },
                TABLE);
    }

    private void addConstraint(String name) {
        jdbc.execute("ALTER TABLE " + TABLE + " ADD CONSTRAINT " + name +
                " CHECK (" + COLUMN + " IN ('NORMAL', 'TRANSFER', 'LOAN'))");
    }

    /** Tespit edilen constraint'in adı + okunabilir tanımı. */
    private static final class ConstraintInfo {
        final String name;
        final String def;

        ConstraintInfo(String name, String def) {
            this.name = name;
            this.def = def;
        }
    }
}
