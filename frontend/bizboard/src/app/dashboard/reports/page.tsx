"use client";

import { useRouter } from "next/navigation";
import { BarChart3, ArrowRight, FileText, Wrench } from "lucide-react";

/**
 * Mobile bottom-nav "Raporlar" item'i. Tam rapor merkezi v1.7.0 iş paketinde
 * (muhasebeci paket PDF + Excel export). Bu sürümde mevcut Finans Sayfası'na
 * yönlendiren bir landing.
 */
export default function ReportsPage() {
  const router = useRouter();

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
