package com.bizboard.service.inventory;

import com.bizboard.common.entity.InventoryItem;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * Akıllı reorder (yeniden sipariş) noktası hesabı — WP f4fe6d82.
 *
 * <h3>Algoritma</h3>
 * Etkili reorder eşiği:
 * <pre>
 *   effectiveReorderPoint =
 *       (reorderPoint manuel set ise) reorderPoint
 *       else                          minimumStock + leadTimeDemand
 *
 *   leadTimeDemand = dailyConsumption × reorderLeadDays
 * </pre>
 *
 * <h3>Tüketim hızı (dailyConsumption)</h3>
 * Sistemde ayrı bir stok-hareket günlüğü (movement ledger) <b>yok</b>; dolayısıyla
 * gerçek geçmiş çıkış zaman-serisi mevcut değil. Tüketim hızını eldeki sinyalden
 * tahmin ediyoruz: satın alma tarihinden bugüne kadarki <b>tükenme</b>. Başlangıç
 * miktarı saklanmadığından, satın alma anında stoğun <b>en az</b> mevcut minimum +
 * o anki current kadar olduğu varsayımıyla, depo girişinden bu yana azalma oranını
 * yaklaşıkla:
 * <pre>
 *   daysSincePurchase = today - purchaseDate   (en az 1)
 *   consumed          = max(0, minimumStock - currentStock)   // minimumun altına düşen kısım
 *   dailyConsumption  = consumed / daysSincePurchase
 * </pre>
 * Bu, hareket günlüğü olmadan deterministik ve açıklanabilir bir yaklaşımdır; gerçek
 * bir ledger eklenirse {@code dailyConsumption} oradan beslenecek şekilde tek noktada
 * değiştirilebilir. Hesaplanamayan durumlarda (purchaseDate yok / veri eksik) güvenli
 * varsayılan: {@code minimumStock} eşik olarak kullanılır (mevcut davranışla geri uyumlu).
 *
 * <p>Sadece {@code CONSUMABLE} (sarf malzeme) kategorisinde anlamlıdır; diğer
 * kategoriler için {@code needsReorder=false} döner.</p>
 */
@Component
public class ReorderCalculator {

    private static final int SCALE = 2;
    private static final int DEFAULT_LEAD_DAYS = 7;

    /** Hesap sonucu: etkili eşik, öneri bayrağı, önerilen sipariş miktarı. */
    public record Result(BigDecimal effectiveReorderPoint,
                         boolean needsReorder,
                         BigDecimal suggestedOrderQuantity) {
    }

    public Result compute(InventoryItem item) {
        if (item == null || !"CONSUMABLE".equals(item.getCategory())) {
            return new Result(null, false, null);
        }
        BigDecimal current = item.getCurrentStock();
        if (current == null) {
            return new Result(null, false, null);
        }

        BigDecimal threshold = effectiveThreshold(item);
        if (threshold == null) {
            return new Result(null, false, null);
        }

        boolean needs = current.compareTo(threshold) <= 0;
        // Eşiğin biraz üstüne (2× lead-time tamponu) tamamlamak için öneri.
        BigDecimal target = threshold.add(threshold).max(threshold);
        BigDecimal suggested = needs ? target.subtract(current).max(BigDecimal.ZERO) : null;
        if (suggested != null) suggested = suggested.setScale(SCALE, RoundingMode.UP);

        return new Result(threshold.setScale(SCALE, RoundingMode.HALF_UP), needs, suggested);
    }

    /** Etkili eşik: manuel reorderPoint öncelikli; yoksa minimum + lead-time talebi. */
    private BigDecimal effectiveThreshold(InventoryItem item) {
        if (item.getReorderPoint() != null && item.getReorderPoint().signum() >= 0) {
            return item.getReorderPoint();
        }
        BigDecimal minimum = item.getMinimumStock();
        if (minimum == null) {
            return null; // ne manuel eşik ne minimum → öneri üretemeyiz
        }
        BigDecimal leadDemand = leadTimeDemand(item);
        return minimum.add(leadDemand);
    }

    /** leadTimeDemand = dailyConsumption × leadDays. */
    private BigDecimal leadTimeDemand(InventoryItem item) {
        BigDecimal daily = estimateDailyConsumption(item);
        if (daily.signum() <= 0) return BigDecimal.ZERO;
        int leadDays = item.getReorderLeadDays() != null && item.getReorderLeadDays() > 0
                ? item.getReorderLeadDays() : DEFAULT_LEAD_DAYS;
        return daily.multiply(BigDecimal.valueOf(leadDays));
    }

    /** Tüketim hızı tahmini (gün başına). Bkz. sınıf javadoc. */
    private BigDecimal estimateDailyConsumption(InventoryItem item) {
        LocalDate purchase = item.getPurchaseDate();
        BigDecimal minimum = item.getMinimumStock();
        BigDecimal current = item.getCurrentStock();
        if (purchase == null || minimum == null || current == null) {
            return BigDecimal.ZERO;
        }
        long days = ChronoUnit.DAYS.between(purchase, LocalDate.now());
        if (days < 1) days = 1;
        BigDecimal consumed = minimum.subtract(current).max(BigDecimal.ZERO);
        if (consumed.signum() <= 0) return BigDecimal.ZERO;
        return consumed.divide(BigDecimal.valueOf(days), 6, RoundingMode.HALF_UP);
    }
}
