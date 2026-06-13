"use client";

import { useBusinesses } from "@/hooks/useBusinesses";
import { usePortfolio } from "@/hooks/usePortfolio";
import { BusinessGrid } from "@/components/dashboard/BusinessGrid";

/**
 * Mobile bottom-nav "Isletmeler" sayfasi. Kullanicinin erisebildigi tum
 * isletmeler liste halinde. Desktop'ta dashboard'da zaten goruluyor;
 * buradaki sayfa esit erisilen + mobile-only nav'in 404 vermesin diye.
 */
export default function BusinessesPage() {
  const { businesses, isLoading: bizLoading, error } = useBusinesses();
  const { portfolio, isLoading: portLoading } = usePortfolio();

  const isLoading = bizLoading || portLoading;

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-bold text-surface-100">İşletmelerim</h1>
        <p className="text-surface-400 mt-1">
          Erişebildiğin tüm işletmeler
        </p>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 bg-surface-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : businesses.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-surface-400">
            Henüz erişebileceğiniz bir işletme yok.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-surface-400">
              {businesses.length} işletme
            </span>
          </div>
          <BusinessGrid businesses={businesses} portfolio={portfolio} />
        </>
      )}
    </div>
  );
}
