package com.bizboard.service;

import com.bizboard.common.entity.PosDeal;
import com.bizboard.common.entity.PosDevice;
import com.bizboard.common.entity.ProfitShareRule;
import com.bizboard.common.enums.ProfitShareRuleType;
import com.bizboard.repository.ProfitShareRuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Ledger v2 (Faz C, §3.4 / §6 / TODO 3) — POS kâr-payı ŞELALE motoru.
 *
 * <p>Bir {@link PosDeal} için aktif {@link ProfitShareRule}'ları çözer ve her
 * operatörün payını hesaplar (KİLİTLİ §6 kuralları). Oran kaynağı hiyerarşisi
 * (§3.4): rule.overridePct → device oranı → global config ({@link
 * ProfitShareConfigService}). <b>Rakam hard-code edilmez.</b></p>
 *
 * <h3>Şelale (per-deal, hacim = grossAmount):</h3>
 * <ul>
 *   <li><b>RATE_SPREAD</b> (Kemal/çalışan, aynı-gün final):
 *       {@code pay = gross × (customerRate − ownerBasePct) / 100}.</li>
 *   <li><b>MARGIN_PCT</b> (Fatih, aynı-gün final, komisyondan bağımsız):
 *       {@code marj = gross × (customerRate − ownerBasePct) / 100};
 *       {@code pay = marj × fatihMarginPct / 100}.</li>
 *   <li><b>OWNER_COMMISSION</b> (Tuncay, T+1 provisional→final):
 *       {@code pay = gross × (ownerBasePct − avgCommission) / 100}.
 *       Provisional'da {@code avgCommission ≈ deviceBankRate} (defaultRate);
 *       final'da settlement batch'in ort.komisyonu.</li>
 *   <li><b>RESIDUAL</b> (şirket, kalan): {@code pay = grossMargin − Σ(diğer paylar)}.
 *       grossMargin = gross × (customerRate − bankRate)/100 (deal'in toplam marjı).</li>
 * </ul>
 *
 * <p><b>Saf hesaplama:</b> bu servis posting yazmaz — sadece pay listesini
 * döndürür. Posting/operatör-kasası akışı {@code PosDealService} +
 * {@code ProfitSharePostingService}'te. Test edilebilir, yan-etkisiz.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProfitShareEngine {

    private static final int SCALE = 2;

    private final ProfitShareRuleRepository ruleRepository;
    private final ProfitShareConfigService config;

    /**
     * Bir deal için tüm kâr-payı bacaklarını hesaplar.
     *
     * @param deal           hesaplanacak deal (gross + customerRate + device)
     * @param avgCommission  T+1 ort.komisyon (yüzde); null ise PROVISIONAL
     *                       (OWNER_COMMISSION deviceBankRate tahminiyle hesaplanır).
     * @return pay bacakları (operatör + tutar + tip + provisional/final).
     */
    @Transactional(readOnly = true)
    public List<ShareLeg> computeShares(PosDeal deal, BigDecimal avgCommission) {
        List<ShareLeg> out = new ArrayList<>();
        if (deal == null || deal.getGrossAmount() == null
                || deal.getGrossAmount().signum() == 0) {
            return out;
        }
        UUID businessId = deal.getBusiness().getId();
        BigDecimal gross = deal.getGrossAmount();
        BigDecimal customerRate = nz(deal.getCustomerRate());
        ProfitShareConfigService.ProfitShareDefaults cfg = config.snapshot();
        BigDecimal bankRate = resolveBankRate(deal.getPosDevice());

        List<ProfitShareRule> rules =
                ruleRepository.findByBusinessIdAndActiveTrueOrderByPriorityAsc(businessId);

        BigDecimal allocatedExcludingResidual = BigDecimal.ZERO;
        ProfitShareRule residualRule = null;

        for (ProfitShareRule rule : rules) {
            // Cihaz-bazlı kural ise sadece o cihazın deal'ine uygula.
            if (rule.getPosDevice() != null
                    && !rule.getPosDevice().getId().equals(deal.getPosDevice().getId())) {
                continue;
            }
            ProfitShareRuleType type = rule.getRuleType();
            if (type == ProfitShareRuleType.RESIDUAL) {
                residualRule = rule; // en sona bırak (kalan = marj − Σ diğer)
                continue;
            }

            BigDecimal pay = switch (type) {
                case RATE_SPREAD -> rateSpread(gross, customerRate, ownerBase(rule, cfg));
                case MARGIN_PCT -> marginPct(gross, customerRate, ownerBase(rule, cfg),
                        marginMultiplier(rule, cfg));
                case OWNER_COMMISSION -> ownerCommission(gross,
                        ownerBase(rule, cfg),
                        avgCommission != null ? avgCommission : bankRate);
                default -> BigDecimal.ZERO;
            };
            pay = pay.setScale(SCALE, RoundingMode.HALF_UP);
            if (pay.signum() == 0) continue;

            boolean provisional = type.isDeferredToSettlement() && avgCommission == null;
            out.add(new ShareLeg(rule, type, pay, provisional));
            allocatedExcludingResidual = allocatedExcludingResidual.add(pay);
        }

        // RESIDUAL = toplam deal marjı − Σ(diğer paylar). Şirket payı.
        if (residualRule != null) {
            BigDecimal grossMargin = gross
                    .multiply(customerRate.subtract(bankRate))
                    .divide(BigDecimal.valueOf(100), SCALE, RoundingMode.HALF_UP);
            BigDecimal residual = grossMargin.subtract(allocatedExcludingResidual)
                    .setScale(SCALE, RoundingMode.HALF_UP);
            // RESIDUAL OWNER_COMMISSION içerdiğinden, ort.komisyon kesinleşene
            // kadar residual da provisional'dır.
            boolean residualProvisional = avgCommission == null
                    && out.stream().anyMatch(s -> s.type().isDeferredToSettlement());
            out.add(new ShareLeg(residualRule, ProfitShareRuleType.RESIDUAL,
                    residual, residualProvisional));
        }

        return out;
    }

    // ───────── pay formülleri (§6 KİLİTLİ) ─────────

    /** Kemal: gross × (customerRate − ownerBasePct) / 100. */
    private BigDecimal rateSpread(BigDecimal gross, BigDecimal customerRate, BigDecimal ownerBase) {
        return gross.multiply(customerRate.subtract(ownerBase))
                .divide(BigDecimal.valueOf(100), SCALE + 4, RoundingMode.HALF_UP);
    }

    /** Fatih: marj × fatihMarginPct / 100; marj = gross × (customerRate − ownerBase)/100. */
    private BigDecimal marginPct(BigDecimal gross, BigDecimal customerRate,
                                 BigDecimal ownerBase, BigDecimal marginMultiplierPct) {
        BigDecimal margin = gross.multiply(customerRate.subtract(ownerBase))
                .divide(BigDecimal.valueOf(100), SCALE + 4, RoundingMode.HALF_UP);
        return margin.multiply(marginMultiplierPct)
                .divide(BigDecimal.valueOf(100), SCALE + 4, RoundingMode.HALF_UP);
    }

    /** Tuncay: gross × (ownerBasePct − avgCommission) / 100. */
    private BigDecimal ownerCommission(BigDecimal gross, BigDecimal ownerBase, BigDecimal avgCommission) {
        return gross.multiply(ownerBase.subtract(avgCommission))
                .divide(BigDecimal.valueOf(100), SCALE + 4, RoundingMode.HALF_UP);
    }

    // ───────── oran çözümleme (§3.4 hiyerarşi) ─────────

    /** Sahip baz oranı: rule.overridePct → config.ownerBasePct. */
    private BigDecimal ownerBase(ProfitShareRule rule, ProfitShareConfigService.ProfitShareDefaults cfg) {
        if (rule.getRuleType() == ProfitShareRuleType.OWNER_COMMISSION) {
            return rule.getOverridePct() != null ? rule.getOverridePct() : cfg.tuncaySpreadPct();
        }
        return rule.getOverridePct() != null ? rule.getOverridePct() : cfg.ownerBasePct();
    }

    /** MARGIN_PCT çarpanı: rule.overridePct → config.fatihMarginPct. */
    private BigDecimal marginMultiplier(ProfitShareRule rule,
                                        ProfitShareConfigService.ProfitShareDefaults cfg) {
        return rule.getOverridePct() != null ? rule.getOverridePct() : cfg.fatihMarginPct();
    }

    /** Cihaz banka oranı (T+1 provisional ort.komisyon tahmini). */
    private BigDecimal resolveBankRate(PosDevice device) {
        if (device == null) return BigDecimal.ZERO;
        return device.getDefaultRate() != null ? device.getDefaultRate() : BigDecimal.ZERO;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    /**
     * Tek bir operatör pay bacağı (hesaplama çıktısı).
     *
     * @param rule        kaynak kural (operatör + hedef kasa)
     * @param type        kural tipi
     * @param amount      pay tutarı (TL, +)
     * @param provisional komisyona bağlı + henüz ort.komisyon yok mu (T+1 bekliyor)
     */
    public record ShareLeg(ProfitShareRule rule, ProfitShareRuleType type,
                           BigDecimal amount, boolean provisional) {}
}
