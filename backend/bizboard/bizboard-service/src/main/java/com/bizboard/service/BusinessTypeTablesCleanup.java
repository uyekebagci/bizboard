package com.bizboard.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * v1.6.2: master `BusinessType` ve `BusinessTypeDefaultCost` tabloları
 * tamamen kaldırıldı (kullanıcı tipini serbest metin olarak giriyor).
 * Hibernate {@code ddl-auto=update} mevcut tabloları DROP etmez, bu
 * ApplicationRunner manuel olarak yapar.
 *
 * <p>İdempotent — DROP IF EXISTS kullanılır. Bir sonraki boot'larda hiçbir
 * etkisi olmaz. v2.0 Flyway baseline'da bu cleanup gereksiz hale gelecek.</p>
 *
 * <p>Sıra: önce {@code businesses.business_type_id} kolonunu CASCADE ile
 * düşür (FK constraint dahil), sonra {@code business_type_default_costs}
 * ve {@code business_types} tablolarını drop et.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BusinessTypeTablesCleanup implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            // 1) businesses.business_type_id kolonu varsa kaldır (FK constraint dahil).
            //    DROP COLUMN CASCADE otomatik olarak bağlı FK constraint'i de düşürür.
            jdbc.update("ALTER TABLE businesses DROP COLUMN IF EXISTS business_type_id CASCADE");

            // 2) Bağımlı tablo önce drop edilir (FK direction: default_costs → types).
            jdbc.update("DROP TABLE IF EXISTS business_type_default_costs CASCADE");
            jdbc.update("DROP TABLE IF EXISTS business_types CASCADE");

            log.info("[business-type-cleanup] master tablolar ve business_type_id kolonu temizlendi");
        } catch (Exception e) {
            // Boot'u kırma — log ile devam et. Bir sonraki deploy'da tekrar deneme yapılır.
            log.warn("[business-type-cleanup] cleanup atlandi: {}", e.getMessage());
        }
    }
}
