"use client";

/**
 * PERF (perf/frontend-pagination): sonsuz-kaydırma alt bileşeni.
 *
 * <p>Liste sonuna konur. Görünmez IntersectionObserver sentinel'i + "daha fazla
 * yükleniyor" spinner'ı + manuel "Daha fazla" butonu + (opsiyonel) liste-sonu
 * mesajını tek yerde toplar. IntersectionObserver mantığı {@link useInfiniteScroll}
 * içindedir; bu bileşen yalnız sunum.</p>
 *
 * <ul>
 *   <li>{@code hasNext} true → sentinel + manuel buton render edilir.</li>
 *   <li>{@code loadingMore} true → spinner.</li>
 *   <li>{@code hasNext} false ve {@code loadedCount > 0} → "tümü yüklendi" notu.</li>
 * </ul>
 *
 * <p>Manuel buton, client-side arama/filtre sonuçları az satıra indiğinde (scroll
 * yüksekliği sentinel'i tetiklemeyecek kadar kısa) kullanıcının yine de sonraki
 * sayfayı çekip daha fazla eşleşme bulabilmesi için durur.</p>
 */

import { Loader2 } from "lucide-react";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";

interface InfiniteScrollSentinelProps {
  hasNext: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  /** Şu ana dek yüklenmiş satır sayısı (liste-sonu notu için). */
  loadedCount: number;
  /** Toplam kayıt sayısı (liste-sonu notu için). */
  totalCount: number;
}

export function InfiniteScrollSentinel({
  hasNext,
  loadingMore,
  loadMore,
  loadedCount,
  totalCount,
}: InfiniteScrollSentinelProps) {
  // Sentinel sadece daha-fazla varken ve şu an yüklemiyorken izlenir.
  const setSentinel = useInfiniteScroll(loadMore, hasNext && !loadingMore);

  return (
    <div className="py-2">
      {hasNext && (
        <div ref={setSentinel} className="h-1 w-full" aria-hidden="true" />
      )}
      {loadingMore ? (
        <div className="flex items-center justify-center gap-2 py-3 text-surface-400 text-xs">
          <Loader2 size={14} className="animate-spin" />
          Daha fazla yukleniyor...
        </div>
      ) : hasNext ? (
        // Manuel fallback — kısa listelerde (arama/filtre) sentinel tetiklenmezse.
        <div className="flex justify-center py-2">
          <button
            type="button"
            onClick={loadMore}
            className="px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-200 text-xs font-medium transition-colors"
          >
            Daha fazla yukle
          </button>
        </div>
      ) : loadedCount > 0 ? (
        <p className="text-center text-[11px] text-surface-500 py-3">
          {totalCount} kaydin tumu yuklendi
        </p>
      ) : null}
    </div>
  );
}
