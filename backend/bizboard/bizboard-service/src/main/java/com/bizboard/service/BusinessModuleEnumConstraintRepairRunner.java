package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * v1.x (hotfix): {@code business_modules.module} enum constraint repair.
 *
 * <p><b>Kök neden (canlı doğrulandı):</b> {@code module} kolonu
 * {@code @Enumerated(EnumType.STRING)} (varchar) → Hibernate 6 boot'ta eski
 * {@link com.bizboard.common.enums.ModuleType} değerlerini listeleyen bir CHECK
 * constraint üretir (ör. {@code module IN ('FINANCE', ...)}). Enum'a yeni değer
 * ({@code DAY_CYCLE}) eklendi ama {@code ddl-auto=update} mevcut CHECK
 * constraint'ini GÜNCELLEMEZ → {@code POST /businesses/{id}/modules/DAY_CYCLE}
 * (ve create-business'taki day_cycle seçimi) <b>409 "veri butunlugu
 * kisitlamasi"</b> ile düşer. (FOOBAR → 400 "No enum constant"; DAY_CYCLE → 409
 * = enum kodda VAR, DB constraint engelliyor.)</p>
 *
 * <p><b>Çözüm:</b> {@code module} kolonu üzerindeki engelleyici CHECK
 * constraint'i adıyla bağımsız tespit edip <b>DROP</b> eder — yeniden EKLEMEZ.
 * DROP sonrası Hibernate {@code update} modu CHECK'i YENİDEN OLUŞTURMAZ →
 * kolon yalnız uygulama-seviyesi enum ile korunur ({@code ModuleType.valueOf}
 * zaten {@code @Enumerated(EnumType.STRING)} okurken/yazarken validasyon yapar)
 * → {@code DAY_CYCLE} ve GELECEKTEKİ tüm yeni modüller sorunsuz insert olur,
 * bu hata bir daha yaşanmaz.</p>
 *
 * <p><b>İki vakaya da dayanıklı:</b>
 * <ul>
 *   <li><b>CHECK constraint (en olası, Hibernate varchar kolon):</b> tablodaki
 *       {@code module} CHECK constraint'i bulunur + DROP edilir.</li>
 *   <li><b>Postgres native ENUM type:</b> kolon tipi {@code enum} ise (CHECK
 *       yerine), {@code ALTER TYPE ... ADD VALUE IF NOT EXISTS 'DAY_CYCLE'} ile
 *       eksik değer eklenir.</li>
 * </ul>
 * Runner önce CHECK arar; yoksa native enum-type kontrolü yapar.</p>
 *
 * <p><b>ROBUST + İDEMPOTENT + NON-FATAL:</b> constraint adı Hibernate-üretimi
 * (sistem adı) olabilir → {@code pg_constraint} ile dinamik bulunur. DROP
 * {@code IF EXISTS} ve var-mı guard'lı → tekrar koşmada no-op (CHECK zaten yoksa
 * hiçbir şey yapmaz). Mevcut module insert/akışı BOZULMAZ (sadece engelleyici
 * constraint kaldırılır; satır verisine dokunulmaz). Hata boot'u DÜŞÜRMEZ
 * (try/catch + log).</p>
 *
 * <p>Not: {@code bank_accounts.type} ve {@code transactions.kind} CHECK onarımları
 * ayrı runner'larda ({@link BankAccountTypeCheckRepairRunner},
 * {@link TransactionKindCheckRepairRunner}). Onlardan farkı: onlar DROP+ADD ile
 * sabit değer listesi yeniden kurar; bu runner DROP eder ve EKLEMEZ — böylece
 * ileride eklenecek modüller için tekrar onarım gerekmez.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(41) // tüm kolon/tablo migration'larından + kind/type CHECK onarımlarından (max @Order(40)) SONRA; module kolonu kesin var
public class BusinessModuleEnumConstraintRepairRunner implements ApplicationRunner {

    private static final String TABLE = "business_modules";
    private static final String COLUMN = "module";

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            if (!tableExists()) {
                log.info("[module-enum-check] '{}' tablosu yok — atlanıyor.", TABLE);
                return;
            }

            // 1) En olası vaka: module kolonu üzerindeki engelleyici CHECK constraint.
            ConstraintInfo check = findModuleCheckConstraint();
            if (check != null) {
                log.warn("[module-enum-check] CHECK constraint '{}' kaldırılıyor (yeni ModuleType " +
                        "değerleri engellenmesin). Eski tanım: {}", check.name, check.def);
                // DROP IF EXISTS — tespit edilen gerçek adı kullan; idempotent.
                jdbc.execute("ALTER TABLE " + TABLE + " DROP CONSTRAINT IF EXISTS \"" + check.name + "\"");
                log.info("[module-enum-check] CHECK constraint '{}' kaldırıldı — DAY_CYCLE + " +
                        "gelecekteki modüller artık insert edilebilir.", check.name);
                return;
            }

            // 2) Native Postgres ENUM type vakası (CHECK yok). Eksikse DAY_CYCLE ekle.
            String enumTypeName = findColumnEnumType();
            if (enumTypeName != null) {
                if (enumValueExists(enumTypeName, "DAY_CYCLE")) {
                    log.debug("[module-enum-check] Native enum type '{}' zaten DAY_CYCLE içeriyor — no-op.", enumTypeName);
                } else {
                    log.warn("[module-enum-check] Native enum type '{}' DAY_CYCLE içermiyor — ekleniyor.", enumTypeName);
                    // ADD VALUE IF NOT EXISTS → idempotent. Ayrı statement (ALTER TYPE
                    // ADD VALUE bazı PG sürümlerinde tx-bloğu içinde çalışamaz; jdbc.execute
                    // auto-commit ile tek başına çalışır).
                    jdbc.execute("ALTER TYPE " + enumTypeName + " ADD VALUE IF NOT EXISTS 'DAY_CYCLE'");
                    log.info("[module-enum-check] Native enum type '{}' içine DAY_CYCLE eklendi.", enumTypeName);
                }
                return;
            }

            // 3) Ne CHECK ne native enum → engel yok (düz varchar). No-op.
            log.debug("[module-enum-check] '{}.{}' üzerinde engelleyici CHECK/enum yok — no-op.", TABLE, COLUMN);
        } catch (Exception e) {
            // Boot'u DÜŞÜRME — sadece logla.
            log.error("[module-enum-check] FAILED (boot devam ediyor):", e);
        }
    }

    /**
     * {@code business_modules.module} kolonu üzerindeki CHECK constraint'ini adıyla
     * bağımsız bulur. Tablodaki tüm CHECK constraint'lerini ({@code contype='c'})
     * tarar; tanımında {@code module} geçen ilkini döner (Hibernate-üretimi sistem
     * adı olabileceği için ada güvenmeyiz).
     */
    private ConstraintInfo findModuleCheckConstraint() {
        return jdbc.query(
                "SELECT c.conname, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c " +
                        "JOIN pg_class t ON c.conrelid = t.oid " +
                        "JOIN pg_namespace n ON t.relnamespace = n.oid " +
                        "WHERE t.relname = ? AND n.nspname = 'public' AND c.contype = 'c'",
                rs -> {
                    while (rs.next()) {
                        String name = rs.getString("conname");
                        String d = rs.getString("def");
                        // Yalnız "module" CHECK'i: tanımı module kolonuna referans
                        // vermeli (ör. ((module)::text = ANY (...)) veya module IN (...)).
                        if (d != null && d.contains(COLUMN)) {
                            return new ConstraintInfo(name, d);
                        }
                    }
                    return null;
                },
                TABLE);
    }

    /**
     * {@code module} kolonu native Postgres ENUM type'ı kullanıyorsa tip adını
     * döner; varchar/text gibi normal tip ise null.
     */
    private String findColumnEnumType() {
        return jdbc.query(
                "SELECT typ.typname FROM pg_attribute a " +
                        "JOIN pg_class t ON a.attrelid = t.oid " +
                        "JOIN pg_namespace n ON t.relnamespace = n.oid " +
                        "JOIN pg_type typ ON a.atttypid = typ.oid " +
                        "WHERE t.relname = ? AND n.nspname = 'public' AND a.attname = ? " +
                        "AND a.attnum > 0 AND NOT a.attisdropped AND typ.typtype = 'e'",
                rs -> rs.next() ? rs.getString(1) : null,
                TABLE, COLUMN);
    }

    /** Verilen native enum type'ın belirtilen değeri içerip içermediğini döner. */
    private boolean enumValueExists(String enumTypeName, String value) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pg_enum e " +
                        "JOIN pg_type t ON e.enumtypid = t.oid " +
                        "WHERE t.typname = ? AND e.enumlabel = ?",
                Integer.class, enumTypeName, value);
        return count != null && count > 0;
    }

    private boolean tableExists() {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables " +
                        "WHERE table_schema='public' AND table_name=?",
                Integer.class, TABLE);
        return count != null && count > 0;
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
