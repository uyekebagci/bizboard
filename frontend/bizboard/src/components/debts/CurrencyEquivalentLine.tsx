"use client";

/**
 * WP currency-display: bir TL toplamın ALTINA, daha küçük fontla USD + gram
 * altın karşılığını gösterir. Alacaklar toplamı ve Cari Hesap toplamı AYNI
 * deseni paylaşsın diye tek component.
 *
 * <ul>
 *   <li>USD karşılığı: usdRate'ten ("$1.234").</li>
 *   <li>Gram altın karşılığı: goldRate'ten ({@link goldEquivalent}: "1,5 kg").
 *       goldRate null ise (altın fiyatı kaynağı henüz yok) "altın fiyatı bekleniyor"
 *       placeholder gösterilir — USD karşılığı yine de tamamlanır.</li>
 * </ul>
 *
 * <p>Çift tema: surface-400 / nötr tonlar (dark + light okunaklı).</p>
 */

import { DollarSign, Coins } from "lucide-react";
import { usdEquivalent, goldEquivalent, cn } from "@/lib/utils";

export function CurrencyEquivalentLine({
  tryTotal,
  usdRate,
  goldRate,
  censored = false,
  className,
}: {
  /** TL toplam (>= 0). */
  tryTotal: number;
  /** 1 USD = ? TL (null → USD karşılığı gizli). */
  usdRate: number | null;
  /** 1 gram altın = ? TL (null → altın placeholder). */
  goldRate: number | null;
  /** Sansür açıkken karşılıkları da gizle (gerçek değer DOM'da kalmasın). */
  censored?: boolean;
  className?: string;
}) {
  // Sansürlüyken karşılığı hesaplama/gösterme — privacy tutarlılığı.
  if (censored) return null;

  const usd = usdEquivalent(tryTotal, usdRate);
  const gold = goldEquivalent(tryTotal, goldRate);

  // Hiç kur yoksa satırı hiç gösterme (boş yer kaplamasın).
  if (!usd && goldRate == null) return null;

  return (
    <div className={cn("mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-surface-400", className)}>
      {usd && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <DollarSign size={11} className="text-emerald-400/80" />
          <span className="font-medium text-surface-300">{usd}</span>
        </span>
      )}
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <Coins size={11} className="text-amber-400/80" />
        {gold ? (
          <span className="font-medium text-surface-300">{gold}</span>
        ) : (
          // Altın fiyatı kaynağı henüz cache'te yok → placeholder (skeleton metin).
          <span className="italic text-surface-500">altın fiyatı bekleniyor…</span>
        )}
      </span>
    </div>
  );
}
