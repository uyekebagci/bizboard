"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useArchivedBusinesses } from "@/hooks/useArchivedBusinesses";
import { usePortfolio } from "@/hooks/usePortfolio";
import { BusinessGrid } from "@/components/dashboard/BusinessGrid";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { useAppStore } from "@/lib/store";

/**
 * Mobile bottom-nav "Isletmeler" sayfasi. Kullanicinin erisebildigi tum
 * isletmeler liste halinde. Desktop'ta dashboard'da zaten goruluyor;
 * buradaki sayfa esit erisilen + mobile-only nav'in 404 vermesin diye.
 *
 * <p>Ayrıca arşivlenmiş işletmeler (varsayılan listede gizli) açılır bir
 * bölümde gösterilir; her biri "Arşivden Çıkar" ile geri yüklenebilir.</p>
 */
export default function BusinessesPage() {
  const { businesses, isLoading: bizLoading, error } = useBusinesses();
  const { portfolio, isLoading: portLoading } = usePortfolio();
  const { archived, isLoading: archLoading, refresh: refreshArchived } =
    useArchivedBusinesses();
  const { triggerRefresh } = useAppStore();

  const [showArchived, setShowArchived] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const isLoading = bizLoading || portLoading;

  async function handleRestore(id: string) {
    setRestoringId(id);
    try {
      await api.post(`/businesses/${id}/unarchive`, {});
      toast.info("İşletme arşivden çıkarıldı");
      await refreshArchived();
      triggerRefresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setRestoringId(null);
    }
  }

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

      {/* Arşivlenmiş işletmeler — geri yükleme (Arşivden Çıkar) */}
      {!archLoading && archived.length > 0 && (
        <section className="pt-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-surface-400 hover:text-surface-200 transition-colors"
          >
            <Archive size={16} />
            Arşivlenmiş İşletmeler ({archived.length})
            <span className="text-xs">{showArchived ? "▲" : "▼"}</span>
          </button>

          {showArchived && (
            <div className="mt-3 space-y-2">
              {archived.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-200/60 border border-surface-300"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-surface-100 truncate">{b.name}</p>
                    <p className="text-xs text-surface-400 truncate">
                      {b.business_type_name || "İşletme"} · arşivlenmiş
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestore(b.id)}
                    disabled={restoringId === b.id}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-300 hover:bg-surface-400/40 text-surface-100 text-xs font-medium disabled:opacity-50"
                    title="Arşivden çıkar (geri yükle)"
                  >
                    {restoringId === b.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <ArchiveRestore size={13} />
                    )}
                    Arşivden Çıkar
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
