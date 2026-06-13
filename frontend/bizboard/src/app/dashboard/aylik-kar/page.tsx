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
  Loader2, TrendingUp, TrendingDown, Receipt, Users, ChevronLeft, ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
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
      <PageHeader
        title="Aylık Kâr"
        subtitle="kategori P&L · gider≠masraf · operatör kırılımı"
        fallbackHref="/dashboard"
      />

      {/* Dönem seçici */}
      <div className="flex items-center justify-between v2-card p-2">
        <button onClick={() => shift(-1)} className="p-2 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] transition-colors">
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-[rgb(var(--v2-ink))]">{MONTHS[month - 1]} {year}</span>
        <button onClick={() => shift(1)} className="p-2 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-status-danger text-sm">{error}</div>
      )}

      {loading && !report ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-[rgb(var(--v2-muted))]" />
        </div>
      ) : report ? (
        <>
          {/* Net kâr özeti */}
          <section className="v2-card p-4">
            <p className="v2-eyebrow mb-1">Net Kâr</p>
            <p className={cn("text-3xl font-bold num",
              report.net_profit >= 0 ? "text-accent-strong dark:text-accent" : "text-status-danger")}>
              {formatCurrency(report.net_profit, "TRY")}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <Stat label="Gelir" value={report.total_income} tone="income" />
              <Stat label="Gider" value={report.total_expense} tone="expense" />
              <Stat label="Masraf" value={report.total_cost} tone="cost" />
            </div>
          </section>

          {/* Kategori P&L — gider≠masraf (§5) */}
          <CategorySection title="Gelir" icon={<TrendingUp size={14} className="text-accent-strong dark:text-accent" />}
            lines={report.income_by_category} tone="income" />
          <CategorySection title="Gider (kira/maaş/operatör payı)"
            icon={<TrendingDown size={14} className="text-status-danger" />}
            lines={report.expense_by_category} tone="expense" />
          <CategorySection title="Masraf (komisyon/transfer ücreti)"
            icon={<Receipt size={14} className="text-status-warning" />}
            lines={report.cost_by_category} tone="cost" />

          {/* Operatör kırılımı (KİM) */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--v2-ink))]">
              <Users size={14} className="text-accent-strong dark:text-accent" /> Operatör Kârı
            </div>
            {(report.operator_profit ?? []).length === 0 && report.company_residual === 0 ? (
              <div className="v2-card p-4 text-center text-sm text-[rgb(var(--v2-muted))]">
                Bu dönemde operatör kârı yok.
              </div>
            ) : (
              <div className="v2-card divide-y divide-[rgb(var(--v2-border))] overflow-hidden">
                {(report.operator_profit ?? []).map((op) => (
                  <div key={op.account_id} className="p-3 flex items-center justify-between gap-2">
                    <span className="text-sm text-[rgb(var(--v2-ink))] truncate">
                      {op.operator_name ?? op.account_name}
                    </span>
                    <span className="text-sm font-semibold text-accent-strong dark:text-accent num">
                      {formatCurrency(op.earned, "TRY")}
                    </span>
                  </div>
                ))}
                {report.company_residual !== 0 && (
                  <div className="p-3 flex items-center justify-between gap-2 bg-[rgb(var(--v2-sunken))]">
                    <span className="text-sm text-[rgb(var(--v2-muted))]">Şirket (residual)</span>
                    <span className="text-sm font-semibold text-[rgb(var(--v2-ink))] num">
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

function Stat({ label, value, tone }: { label: string; value: number; tone: "income" | "expense" | "cost" }) {
  const color = tone === "income"
    ? "text-accent-strong dark:text-accent"
    : tone === "expense"
    ? "text-status-danger"
    : "text-status-warning";
  return (
    <div className="rounded-xl p-2 v2-sunken text-center">
      <p className="v2-eyebrow text-[10px]">{label}</p>
      <p className={cn("text-sm font-bold num mt-0.5", color)}>{formatCurrency(value, "TRY")}</p>
    </div>
  );
}

function CategorySection({ title, icon, lines, tone }: {
  title: string; icon: React.ReactNode; lines: ProfitCategoryLine[]; tone: "income" | "expense" | "cost";
}) {
  if (!lines || lines.length === 0) return null;
  const color = tone === "income"
    ? "text-accent-strong dark:text-accent"
    : tone === "expense"
    ? "text-status-danger"
    : "text-status-warning";
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--v2-ink))]">{icon} {title}</div>
      <div className="v2-card divide-y divide-[rgb(var(--v2-border))] overflow-hidden">
        {lines.map((l, i) => (
          <div key={l.category_id ?? `${title}-${i}`} className="p-3 flex items-center justify-between gap-2">
            <span className="text-sm text-[rgb(var(--v2-muted))] truncate">{l.category_name}</span>
            <span className={cn("text-sm font-semibold num", color)}>{formatCurrency(l.amount, "TRY")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
