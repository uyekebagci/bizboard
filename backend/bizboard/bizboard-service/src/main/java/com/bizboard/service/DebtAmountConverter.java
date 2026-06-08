package com.bizboard.service;

import com.bizboard.common.entity.Debt;
import com.bizboard.repository.CurrencyRateRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * WP a9da4e9d (USD+Altın): Borç tutarlarını GÜNCEL kurla TL'ye çevirir.
 *
 * <p>Strateji B: KONSOLİDE NET = recompute edilmiş current_balance. Bu helper,
 * recompute + toplam (consolidated/receivable) yüzeylerinde tek noktadan
 * "orijinal tutar × güncel kur = TL" çevrimi yapar. TRY borçlar dokunulmaz
 * (rate=1). Kur bilinmiyorsa (cache boş) güvenli fallback: mevcut TL amount.</p>
 *
 * <p>magnitude POZİTİF korunur — sign convention çağıran tarafta (direction).</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DebtAmountConverter {

    private final CurrencyRateRepository rateRepository;

    /** Borcun orijinal para birimi (currency). Null/boş → TRY. */
    private static String currencyOf(Debt d) {
        String c = d.getCurrency();
        return (c == null || c.isBlank()) ? "TRY" : c.toUpperCase();
    }

    /** 1 birim currency = ? TL (cache'ten). TRY → 1; bilinmiyorsa null. */
    private BigDecimal rate(String currency) {
        if ("TRY".equals(currency)) return BigDecimal.ONE;
        return rateRepository.findByCode(currency).map(r -> r.getRateToTry()).orElse(null);
    }

    /**
     * Borcun verilen TL-bazlı tutarını (amount ya da remaining) GÜNCEL kura göre
     * TL'ye çevir. TRY → aynen döner. USD/GOLD → original bazlı çevirir.
     *
     * <p>USD/GOLD'da {@code original_amount} kaynak gerçeğidir; baseTlAmount,
     * remaining gibi oransal bir değerse oran korunur (remaining/amount × original
     * × rate). original_amount yoksa (legacy) baseTlAmount aynen döner.</p>
     */
    public BigDecimal toTry(Debt d, BigDecimal baseTlAmount) {
        if (baseTlAmount == null) return BigDecimal.ZERO;
        String currency = currencyOf(d);
        if ("TRY".equals(currency)) return baseTlAmount;

        BigDecimal r = rate(currency);
        if (r == null) {
            // Kur cache'i henüz dolmadıysa: mevcut TL değeri bozma (güvenli fallback).
            return baseTlAmount;
        }
        BigDecimal original = d.getOriginalAmount();
        if (original == null || original.signum() == 0) {
            // Legacy/eksik original → düz çarpım yapamayız; mevcut TL'yi koru.
            return baseTlAmount;
        }
        // remaining oranını koru: (baseTl / amountTl) × (original × rate).
        BigDecimal amountTl = d.getAmount();
        BigDecimal fullTry = original.multiply(r);
        if (amountTl != null && amountTl.signum() > 0 && baseTlAmount.compareTo(amountTl) != 0) {
            BigDecimal ratio = baseTlAmount.divide(amountTl, 8, RoundingMode.HALF_UP);
            return fullTry.multiply(ratio).setScale(2, RoundingMode.HALF_UP);
        }
        return fullTry.setScale(2, RoundingMode.HALF_UP);
    }

    /** Borcun GÜNCEL TL tam tutarı (amount karşılığı). */
    public BigDecimal fullToTry(Debt d) {
        return toTry(d, d.getAmount() != null ? d.getAmount() : BigDecimal.ZERO);
    }

    /** Bu borç için güncel kur (snapshot güncellemesi/gösterim için). TRY → 1. */
    public BigDecimal currentRate(Debt d) {
        BigDecimal r = rate(currencyOf(d));
        return r != null ? r : BigDecimal.ONE;
    }

    /** USD/GOLD mu (çevrim gerektirir mi)? */
    public boolean isForeign(Debt d) {
        return !"TRY".equals(currencyOf(d));
    }

    /** Create anı çözümü: orijinal tutar + currency → TL amount + kur. */
    public record CreateResolution(String currency, BigDecimal originalAmount,
                                   BigDecimal rate, BigDecimal tlAmount) {}

    /**
     * Yeni borç için currency/rate/TL çözümü. TRY → rate=1, tl=original.
     * USD/GOLD → tl = original × güncel kur (cache boşsa 1:1 güvenli fallback).
     */
    public CreateResolution resolveOnCreate(String rawCurrency, BigDecimal originalAmount, String businessCurrency) {
        String currency = rawCurrency != null ? rawCurrency
                : (businessCurrency != null ? businessCurrency : "TRY");
        currency = currency.toUpperCase();
        BigDecimal rate = rate(currency);
        if (rate == null) rate = BigDecimal.ONE;
        BigDecimal tl = "TRY".equals(currency)
                ? originalAmount
                : originalAmount.multiply(rate).setScale(2, RoundingMode.HALF_UP);
        return new CreateResolution(currency, originalAmount, rate, tl);
    }
}
