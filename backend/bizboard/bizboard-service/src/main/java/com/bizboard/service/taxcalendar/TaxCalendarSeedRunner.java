package com.bizboard.service.taxcalendar;

import com.bizboard.common.entity.TaxDeadlineRule;
import com.bizboard.common.enums.TaxFrequency;
import com.bizboard.common.enums.TaxObligationType;
import com.bizboard.repository.TaxDeadlineRuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Vergi Takvimi Modülü — TR (GİB) vergi son tarih kurallarının startup seed'i.
 *
 * <p>Proje şema yönetimi için Hibernate {@code ddl-auto:update} kullanır
 * (Flyway yok); master data {@code phones-master} gibi seed runner pattern'i ile
 * yüklenir. Her kural {@code seedKey} ile idempotenttir — varsa atlanır, açıklama
 * değişmişse güncellenir. Yeniden başlatmada veya prod deploy'da güvenle çalışır.</p>
 *
 * <p>Kaynak: GİB Vergi Takvimi (güncel kurallar). Geçici verginin 4. dönemi
 * 2022'den itibaren kaldırılmıştır → quarter mask Q1+Q2+Q3.</p>
 */
@Slf4j
@Component
@Order(50)
@RequiredArgsConstructor
public class TaxCalendarSeedRunner implements ApplicationRunner {

    private final TaxDeadlineRuleRepository repository;

    /** Çeyrek maskesi Q1|Q2|Q3 (Q4 geçici vergi kaldırıldı). */
    private static final int Q1_Q2_Q3 = 0b0111;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        try {
            List<TaxDeadlineRule> seeds = buildSeeds();
            int created = 0;
            int updated = 0;
            for (TaxDeadlineRule seed : seeds) {
                var existing = repository.findBySeedKey(seed.getSeedKey()).orElse(null);
                if (existing == null) {
                    repository.save(seed);
                    created++;
                } else if (!existing.getDescription().equals(seed.getDescription())) {
                    existing.setDescription(seed.getDescription());
                    repository.save(existing);
                    updated++;
                }
            }
            log.info("[tax-calendar-seed] kural seed tamam — eklenen={} guncellenen={} toplam={}",
                    created, updated, seeds.size());
        } catch (Exception e) {
            // Seed best-effort: başarısız olursa uygulama açılışını engelleme.
            log.warn("[tax-calendar-seed] seed hatası (atlandı): {}", e.getMessage());
        }
    }

    private List<TaxDeadlineRule> buildSeeds() {
        return List.of(
                // KDV-1 — aylık, izleyen ayın 28'i.
                TaxDeadlineRule.builder()
                        .seedKey("KDV-MONTHLY")
                        .obligationType(TaxObligationType.KDV)
                        .frequency(TaxFrequency.MONTHLY)
                        .dayOfMonth(28)
                        .monthOffset(1)
                        .description("KDV beyan ve ödeme son günü")
                        .active(true)
                        .build(),
                // Muhtasar ve Prim Hizmet Beyannamesi — aylık, izleyen ayın 26'sı.
                TaxDeadlineRule.builder()
                        .seedKey("MUHTASAR-MONTHLY")
                        .obligationType(TaxObligationType.MUHTASAR)
                        .frequency(TaxFrequency.MONTHLY)
                        .dayOfMonth(26)
                        .monthOffset(1)
                        .description("Muhtasar ve Prim Hizmet Beyannamesi son günü")
                        .active(true)
                        .build(),
                // Form Ba/Bs — aylık, izleyen ayın son günü (dayOfMonth=0 → ayın sonu).
                TaxDeadlineRule.builder()
                        .seedKey("BA-BS-MONTHLY")
                        .obligationType(TaxObligationType.BA_BS)
                        .frequency(TaxFrequency.MONTHLY)
                        .dayOfMonth(0)
                        .monthOffset(1)
                        .description("Form Ba-Bs bildirim son günü")
                        .active(true)
                        .build(),
                // Geçici Vergi — üç aylık, çeyrek bitiminden 2 ay sonra ayın 17'si (Q1-Q3).
                TaxDeadlineRule.builder()
                        .seedKey("GECICI-VERGI-QUARTERLY")
                        .obligationType(TaxObligationType.GECICI_VERGI)
                        .frequency(TaxFrequency.QUARTERLY)
                        .dayOfMonth(17)
                        .monthOffset(2)
                        .quarterMask(Q1_Q2_Q3)
                        .description("Geçici Vergi beyan ve ödeme son günü")
                        .active(true)
                        .build(),
                // Kurumlar Vergisi yıllık — izleyen yıl Nisan ayının son günü.
                TaxDeadlineRule.builder()
                        .seedKey("KURUMLAR-VERGISI-YEARLY")
                        .obligationType(TaxObligationType.KURUMLAR_VERGISI)
                        .frequency(TaxFrequency.YEARLY)
                        .fixedMonth(4)
                        .dayOfMonth(30)
                        .description("Kurumlar Vergisi yıllık beyan ve ödeme son günü")
                        .active(true)
                        .build(),
                // Gelir Vergisi yıllık — izleyen yıl Mart ayının son günü.
                TaxDeadlineRule.builder()
                        .seedKey("GELIR-VERGISI-YEARLY")
                        .obligationType(TaxObligationType.GELIR_VERGISI)
                        .frequency(TaxFrequency.YEARLY)
                        .fixedMonth(3)
                        .dayOfMonth(31)
                        .description("Gelir Vergisi yıllık beyan ve ödeme son günü")
                        .active(true)
                        .build()
        );
    }
}
