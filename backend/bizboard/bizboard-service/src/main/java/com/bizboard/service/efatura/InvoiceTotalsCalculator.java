package com.bizboard.service.efatura;

import com.bizboard.common.entity.Invoice;
import com.bizboard.common.entity.InvoiceLine;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * e-Fatura KDV / toplam hesaplayıcı (BigDecimal, HALF_UP, 2 hane).
 *
 * <p>Para hesabı asla {@code double} ile yapılmaz. Her satır için:
 * {@code matrah = (miktar × birim fiyat) − iskonto}; {@code KDV = matrah × oran/100}.
 * Başlık toplamları satır toplamlarının toplamıdır. Hesap saf/yan-etkisizdir —
 * yalnız {@link Invoice} ve satırlarının türetilmiş alanlarını set eder.</p>
 */
@Component
public class InvoiceTotalsCalculator {

    private static final BigDecimal HUNDRED = new BigDecimal("100");

    /**
     * Fatura ve satır kalemlerinin türetilmiş tutarlarını yeniden hesaplar.
     * İdempotent: aynı girdi için her zaman aynı çıktı.
     */
    public void recompute(Invoice inv) {
        BigDecimal lineExtTotal = BigDecimal.ZERO;
        BigDecimal taxTotal = BigDecimal.ZERO;
        BigDecimal allowanceTotal = BigDecimal.ZERO;

        for (InvoiceLine line : inv.getLines()) {
            BigDecimal qty = nz(line.getQuantity(), BigDecimal.ONE);
            BigDecimal price = nz(line.getUnitPrice(), BigDecimal.ZERO);
            BigDecimal discount = scale2(nz(line.getDiscountAmount(), BigDecimal.ZERO));
            BigDecimal vatRate = nz(line.getVatRate(), BigDecimal.ZERO);

            BigDecimal gross = scale2(qty.multiply(price));
            BigDecimal lineExt = gross.subtract(discount);
            if (lineExt.signum() < 0) lineExt = BigDecimal.ZERO;
            lineExt = scale2(lineExt);

            BigDecimal vatAmount = lineExt.multiply(vatRate)
                    .divide(HUNDRED, 2, RoundingMode.HALF_UP);

            line.setLineExtensionAmount(lineExt);
            line.setVatAmount(vatAmount);
            line.setDiscountAmount(discount);

            lineExtTotal = lineExtTotal.add(lineExt);
            taxTotal = taxTotal.add(vatAmount);
            allowanceTotal = allowanceTotal.add(discount);
        }

        lineExtTotal = scale2(lineExtTotal);
        taxTotal = scale2(taxTotal);
        allowanceTotal = scale2(allowanceTotal);

        inv.setLineExtensionAmount(lineExtTotal);
        inv.setAllowanceTotalAmount(allowanceTotal);
        // Matrah = satır toplamları (iskonto satır bazında zaten düşüldü).
        inv.setTaxExclusiveAmount(lineExtTotal);
        inv.setTotalTaxAmount(taxTotal);
        BigDecimal inclusive = scale2(lineExtTotal.add(taxTotal));
        inv.setTaxInclusiveAmount(inclusive);
        inv.setPayableAmount(inclusive);
    }

    private static BigDecimal scale2(BigDecimal v) {
        return (v != null ? v : BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal nz(BigDecimal v, BigDecimal dflt) {
        return v != null ? v : dflt;
    }
}
