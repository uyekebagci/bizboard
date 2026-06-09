package com.bizboard.service;

import com.bizboard.common.entity.MyCompany;
import com.bizboard.common.enums.CompanyType;
import com.bizboard.repository.MyCompanyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * v1.5.0 ile tanıtılan {@code my_companies} tablosu için startup bootstrap.
 *
 * <p>İki adımı idempotent yapar:</p>
 * <ol>
 *   <li>Hiç {@link MyCompany} kaydı yoksa "Default Firmam" oluştur ({@code is_default=true}).</li>
 *   <li>{@code businesses.my_company_id IS NULL} olan tüm satırları "Default Firmam"a bağla.</li>
 * </ol>
 *
 * <p>Kullanıcı sonradan admin paneli üzerinden gerçek tüzel kişi(ler) oluşturup
 * her işletmeyi doğru firmaya yeniden atayabilir. v2.0.0 Flyway iş paketinde
 * bootstrap migration script'e dönüşür, bu sınıf silinir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DefaultMyCompanyBootstrap implements ApplicationRunner {

    private final MyCompanyRepository myCompanyRepository;
    private final JdbcTemplate jdbc;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        try {
            MyCompany defaultCo = ensureDefaultCompany();
            int updated = jdbc.update(
                    "UPDATE businesses SET my_company_id = ? WHERE my_company_id IS NULL",
                    defaultCo.getId());
            if (updated > 0) {
                log.warn("[my-company-bootstrap] {} businesses linked to default company '{}' ({})",
                        updated, defaultCo.getLegalName(), defaultCo.getId());
            } else {
                log.info("[my-company-bootstrap] all businesses already linked to a my_company");
            }
        } catch (Exception e) {
            // Tablo henüz oluşturulmamış olabilir (ilk boot Hibernate gecikmesi);
            // bir sonraki boot tekrar denenir. Fatal değil.
            log.warn("[my-company-bootstrap] skipped: {}", e.getMessage());
        }
    }

    private MyCompany ensureDefaultCompany() {
        return myCompanyRepository.findFirstByIsDefaultTrue().orElseGet(() -> {
            // İlk seferde hiç firma yoksa varsayılan kaydı oluştur.
            // Sadece tek bir varsayılan olmalı; race yok çünkü ApplicationRunner
            // single-threaded.
            MyCompany c = MyCompany.builder()
                    .legalName("Default Firmam")
                    .companyType(CompanyType.OTHER)
                    .isDefault(true)
                    .build();
            // saveAndFlush: aşağıdaki raw JDBC UPDATE (businesses.my_company_id = c.id)
            // bu satıra FK ile referans veriyor. Düz save() JPA insert'ini aynı tx
            // içinde geciktirebilir → Postgres FK hedefini göremez → FK violation +
            // "current transaction is aborted" (25P02) → startup fatal olur. Flush ile
            // insert'i JDBC çağrısından ÖNCE DB'ye yazmayı garanti ederiz.
            c = myCompanyRepository.saveAndFlush(c);
            log.warn("[my-company-bootstrap] created default company '{}' (id={}). "
                    + "Admin panelinden gercek tuzel kisi olusturup isletmeleri yeniden atayabilirsin.",
                    c.getLegalName(), c.getId());
            return c;
        });
    }
}
