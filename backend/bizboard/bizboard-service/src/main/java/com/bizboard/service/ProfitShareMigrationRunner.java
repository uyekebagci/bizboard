package com.bizboard.service;

import com.bizboard.common.entity.BankAccount;
import com.bizboard.common.entity.Business;
import com.bizboard.common.enums.BankAccountType;
import com.bizboard.repository.BankAccountRepository;
import com.bizboard.repository.BusinessRepository;
import com.bizboard.repository.ProfitShareRuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Ledger v2 (Faz C, §3.11 / §8.6 — STRICT) — operatör kâr-merkezi (PROFIT_CENTER)
 * + ProfitShareRule geçişi için ÖNERİ (suggestion) runner.
 *
 * <p><b>OTOMATİK COMMIT ETMEZ (STRICT):</b> SPEC §8.6 + §3.11 gereği mevcut
 * SUB_CASH kayıtlarını (Fatih abi vb.) operatör/kâr-merkezi rolüne map'leme +
 * ProfitShareRule ilişkilendirme = KULLANICI ONAYI gerektirir. Bu runner yalnız
 * teşhis loglar (hangi SUB_CASH'ler operatör adayı, kaç kural mevcut). Gerçek
 * map'leme admin UI'dan ({@code AdminProfitShareController} + BankAccount edit)
 * yapılır.</p>
 *
 * <p><b>İdempotent + non-fatal:</b> sadece okur + loglar; DB'ye yazmaz. Çift
 * koşturma güvenli; hata izole (başlatmayı bloklamaz).</p>
 *
 * <p>v2.0.0'da admin UI map'leme yerleşince bu teşhis runner'ı kaldırılabilir.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(31) // TransactionPostingBackfill (30) sonrası
public class ProfitShareMigrationRunner implements ApplicationRunner {

    private final BusinessRepository businessRepository;
    private final BankAccountRepository bankAccountRepository;
    private final ProfitShareRuleRepository ruleRepository;

    @Override
    public void run(ApplicationArguments args) {
        try {
            int totalSubCash = 0;
            int alreadyProfitCenter = 0;
            int candidates = 0;
            long totalRules = 0;
            for (Business b : businessRepository.findAll()) {
                List<BankAccount> subCashes = bankAccountRepository
                        .findByBusinessIdAndTypeOrderByNameAsc(b.getId(), BankAccountType.SUB_CASH);
                totalSubCash += subCashes.size();
                for (BankAccount acc : subCashes) {
                    if (acc.isProfitCenter()) {
                        alreadyProfitCenter++;
                    } else {
                        candidates++;
                        log.info("[profit-share-migration] ÖNERİ: SUB_CASH '{}' (id={}) operatör "
                                        + "kâr-merkezi olabilir → admin UI'dan role=PROFIT_CENTER + "
                                        + "ProfitShareRule ilişkilendir (STRICT: otomatik commit YOK).",
                                acc.getName(), acc.getId());
                    }
                }
                totalRules += ruleRepository.countByBusinessId(b.getId());
            }
            log.info("[profit-share-migration] tarama tamam — SUB_CASH:{}, zaten-PROFIT_CENTER:{}, "
                            + "operatör-adayı(öneri):{}, mevcut-kural:{}. (Map'leme admin onayıyla yapılır.)",
                    totalSubCash, alreadyProfitCenter, candidates, totalRules);
        } catch (Exception e) {
            log.error("[profit-share-migration] FAILED (non-fatal) — teşhis atlandı:", e);
        }
    }
}
