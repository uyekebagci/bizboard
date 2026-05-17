"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ArrowRight, FileText, Wrench, Wallet, Building2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { useBusinesses } from "@/hooks/useBusinesses";
import { formatCurrency } from "@/lib/utils";
import type { Transaction } from "@/types";

/**
 * Mobile bottom-nav "Raporlar" item'i. Tam rapor merkezi v1.7.0 iş paketinde.
 * v1.5.10: Kurulum maliyetleri ayri gosterim widget'i eklendi (Tipler WP'sinin
 * "Raporda kurulum maliyetlerinin ayri gosterimi" TODO'sunu kapatir).
 */
export default function ReportsPage() {
  const router = useRouter();
  const { businesses } = useBusinesses();
  const [allTx, setAllTx] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTxLoading(true);
    api.get<Transaction[]>("/portfolio/transactions/all")
      .then((d) => { if (!cancelled) setAllTx(d || []); })
      .catch(() => { if (!cancelled) setAllTx([]); })
      .finally(() => { if (!cancelled) setTxLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // v1.5.10: kurulum maliyetleri ayri ayri toplanir
  const setupSummary = useMemo(() => {
    const setupTxs = allTx.filter((t) => t.is_setup_cost);
    if (setupTxs.length === 0) return null;

    const totalAmount = setupTxs.reduce((s, t) => s + t.amount, 0);
    const byBusiness = new Map<string, { id: string; name: string; total: number; count: number }>();
    for (const t of setupTxs) {
      const bId = t.business_id;
      const bName = t.business_name || businesses.find((b) => b.id === bId)?.name || "?";
      const cur = byBusiness.get(bId) ?? { id: bId, name: bName, total: 0, count: 0 };
      cur.total += t.amount;
      cur.count++;
      byBusiness.set(bId, cur);
    }
    return {
      total: totalAmount,
      count: setupTxs.length,
      byBusiness: Array.from(byBusiness.values()).sort((a, b) => b.total - a.total),
    };
  }, [allTx, businesses]);

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-bold text-white">Raporlar</h1>
        <p className="text-surface-400 mt-1 text-sm">
          Finansal goruntulemeler ve donem analizleri
        </p>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => router.push("/dashboard/finance")}
          className="card p-5 text-left hover:shadow-card-hover transition-all active:scale-[0.98] group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <BarChart3 size={22} className="text-emerald-400" />
            </div>
            <ArrowRight size={18} className="text-surface-500 group-hover:text-white transition-colors" />
          </div>
          <h3 className="font-semibold text-white">Finans Ozeti</h3>
          <p className="text-xs text-surface-400 mt-1">
            Donem bazli gelir/gider, kategori dagilimi, nakit akisi
          </p>
        </button>

        <button
          onClick={() => router.push("/dashboard/counterparts")}
          className="card p-5 text-left hover:shadow-card-hover transition-all active:scale-[0.98] group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <FileText size={22} className="text-cyan-400" />
            </div>
            <ArrowRight size={18} className="text-surface-500 group-hover:text-white transition-colors" />
          </div>
          <h3 className="font-semibold text-white">Cari Hesap Ekstreleri</h3>
          <p className="text-xs text-surface-400 mt-1">
            Karsi firma bazinda hareket gecmisi, yazdirilabilir
          </p>
        </button>
      </div>

      {/* v1.5.10: Kurulum Maliyetleri widget'i */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wallet size={18} className="text-amber-400" />
          <h2 className="text-base font-semibold text-white">Kurulum Maliyetleri</h2>
          <span className="text-[10px] uppercase tracking-wide text-surface-500 ml-1">
            ozet
          </span>
        </div>

        {txLoading ? (
          <p className="text-sm text-surface-400">Yukleniyor...</p>
        ) : !setupSummary ? (
          <p className="text-sm text-surface-400">
            Henuz kurulum maliyeti olarak isaretlenmis transaction yok. Yeni isletme
            wizard&apos;inda &quot;Kurulus&quot; adimindan veya tek tek tx&apos;leri
            <code className="text-[10px] mx-1 px-1 py-0.5 bg-surface-700 rounded">is_setup_cost</code>
            bayragi ile isaretle.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-surface-400">
                  Toplam Tutar
                </p>
                <p className="text-2xl font-bold text-amber-400 mt-1">
                  {formatCurrency(setupSummary.total)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-surface-400">
                  Tx Sayisi
                </p>
                <p className="text-2xl font-bold text-white mt-1">
                  {setupSummary.count}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-surface-400">
                Isletme Kirilimi
              </p>
              {setupSummary.byBusiness.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between bg-surface-700/40 px-3 py-2 rounded-lg"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 size={14} className="text-surface-400 shrink-0" />
                    <span className="text-sm text-surface-200 truncate">{b.name}</span>
                    <span className="text-[10px] text-surface-500">({b.count})</span>
                  </div>
                  <span className="text-sm font-semibold text-amber-400 shrink-0">
                    {formatCurrency(b.total)}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-surface-500 mt-4">
              Kurulum maliyetleri{" "}
              <code className="px-1 py-0.5 bg-surface-700 rounded">is_setup_cost=true</code>{" "}
              bayrakli tek seferlik EXPENSE tx&apos;leridir. Rutin operasyonel giderlerden
              ayri tutmak icin v1.5.6&apos;da eklenen flag.
            </p>
          </>
        )}
      </section>

      {/* Yol haritasi */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wrench size={16} className="text-surface-400" />
          <h2 className="text-sm font-semibold text-surface-200">Yakinda</h2>
        </div>
        <ul className="text-xs text-surface-400 space-y-2">
          <li>• Muhasebeci paket: PDF + Excel toplu rapor</li>
          <li>• Gelir tablosu, nakit akis tablosu, KDV ozeti</li>
          <li>• BA-BS bildirim formati</li>
          <li>• Butce vs gerceklesme grafigi</li>
        </ul>
        <p className="text-[10px] text-surface-500 mt-3">
          Rapor merkezi tam paketi v1.7.0 surumunde planli.
        </p>
      </div>
    </div>
  );
}
