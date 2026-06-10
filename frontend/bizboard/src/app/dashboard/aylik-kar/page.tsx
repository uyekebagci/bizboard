"use client";

/**
 * Ledger v2 (Faz C, §5 / §6 / TODO 6+7): Aylık Kâr — kategori P&L (gelir/gider/
 * masraf ayrı) + operatör/kâr-merkezi kırılımı + dönem seçimi.
 *
 * - Dönem seçici (yıl/ay) + net kâr özeti.
 * - Kategori P&L: gelir / gider (kira/maaş/operatör payı) / masraf (komisyon/
 *   transfer ücreti) AYRI bölümler (§5 gider≠masraf).
 * - Operatör kırılımı: her operatörün biriken kârı + şirket residual.
 *
 * Çift tema.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, TrendingUp, TrendingDown, Receipt, Users, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useBusinesses } from "@/hooks/useBusinesses";
import { useMonthlyProfit } from "@/hooks/useMonthlyProfit";
import { formatCurrency, cn } from "@/lib/utils";
import type { ProfitCategoryLine } from "@/types";

const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export default function AylikKarPage() {
  const router = useRouter();
  const { businesses } = useBusinesses();
  const businessId = businesses?.[0]?.id ?? null;

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const { report, loading, error } = useMonthlyProfit(businessId, year, month);

  function shift(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors">
          <ArrowLeft size={20} className="text-surface-300" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Aylık Kâr</h1>
          <p className="text-xs text-surface-400">kategori P&L · gider≠masraf · operatör kırılımı</p>
        </div>
      </div>

      {/* Dönem seçici */}
      <div className="flex items-center justify-between glass-card p-2">
        <button onClick={() => shift(-1)} className="p-2 rounded-lg hover:bg-surface-700 text-surface-300">
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-white">{MONTHS[month - 1]} {year}</span>
        <button onClick={() => shift(1)} className="p-2 rounded-lg hover:bg-surface-700 text-surface-300">
          <ChevronRight size={18} />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
      )}

      {loading && !report ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-surface-400" />
        </div>
      ) : report ? (
        <>
          {/* Net kâr özeti */}
          <section className="card p-4 border border-surface-700">
            <p className="text-[11px] text-surface-400 uppercase tracking-wider mb-1">Net Kâr</p>
            <p className={cn("text-3xl font-bold num",
              report.net_profit >= 0 ? "text-emerald-400" : "text-red-400")}>
              {formatCurrency(report.net_profit, "TRY")}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <Stat label="Gelir" value={report.total_income} className="text-emerald-400" />
              <Stat label="Gider" value={report.total_expense} className="text-red-400" />
              <Stat label="Masraf" value={report.total_cost} className="text-amber-400" />
            </div>
          </section>

          {/* Kategori P&L — gider≠masraf (§5) */}
          <CategorySection title="Gelir" icon={<TrendingUp size={14} className="text-emerald-400" />}
            lines={report.income_by_category} color="text-emerald-400" />
          <CategorySection title="Gider (kira/maaş/operatör payı)"
            icon={<TrendingDown size={14} className="text-red-400" />}
            lines={report.expense_by_category} color="text-red-400" />
          <CategorySection title="Masraf (komisyon/transfer ücreti)"
            icon={<Receipt size={14} className="text-amber-400" />}
            lines={report.cost_by_category} color="text-amber-400" />

          {/* Operatör kırılımı (KİM) */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Users size={14} className="text-brand-300" /> Operatör Kârı
            </div>
            {(report.operator_profit ?? []).length === 0 && report.company_residual === 0 ? (
              <div className="glass-card p-4 text-center text-sm text-surface-400">
                Bu dönemde operatör kârı yok.
              </div>
            ) : (
              <div className="glass-card divide-y divide-surface-700">
                {(report.operator_profit ?? []).map((op) => (
                  <div key={op.account_id} className="p-3 flex items-center justify-between gap-2">
                    <span className="text-sm text-white truncate">
                      {op.operator_name ?? op.account_name}
                    </span>
                    <span className="text-sm font-semibold text-emerald-400 num">
                      {formatCurrency(op.earned, "TRY")}
                    </span>
                  </div>
                ))}
                {report.company_residual !== 0 && (
                  <div className="p-3 flex items-center justify-between gap-2 bg-surface-900/30">
                    <span className="text-sm text-surface-300">Şirket (residual)</span>
                    <span className="text-sm font-semibold text-white num">
                      {formatCurrency(report.company_residual, "TRY")}
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-xl p-2 bg-surface-900/40 border border-surface-700/60 text-center">
      <p className="text-[10px] text-surface-400 uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-bold num mt-0.5", className)}>{formatCurrency(value, "TRY")}</p>
    </div>
  );
}

function CategorySection({ title, icon, lines, color }: {
  title: string; icon: React.ReactNode; lines: ProfitCategoryLine[]; color: string;
}) {
  if (!lines || lines.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">{icon} {title}</div>
      <div className="glass-card divide-y divide-surface-700">
        {lines.map((l, i) => (
          <div key={l.category_id ?? `${title}-${i}`} className="p-3 flex items-center justify-between gap-2">
            <span className="text-sm text-surface-300 truncate">{l.category_name}</span>
            <span className={cn("text-sm font-semibold num", color)}>{formatCurrency(l.amount, "TRY")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
