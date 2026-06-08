"use client";

import { TrendingUp, TrendingDown, Pin, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { periodLabel, SYSTEM_DEFAULT_PERIOD, type Period } from "@/lib/preferences";
import type { PortfolioSummary } from "@/types";
import { AreaSparkline } from "@/components/shared/charts/AreaSparkline";

interface Props {
  portfolio: PortfolioSummary | null;
  /** v1.6.7+: aktif periyot — etiketler bunla dinamik. */
  period?: Period;
}

export function PortfolioCard({ portfolio, period }: Props) {
  if (!portfolio) {
    return (
      <div className="card p-6 text-center text-surface-400">
        Henuz veri yok. Baslamak icin ilk isletmenizi ekleyin.
      </div>
    );
  }

  const {
    total_income,
    total_expense,
    net_profit_with_fixed,
    fixed_cost_total,
    total_expense_with_fixed,
  } = portfolio;

  const netProfit = net_profit_with_fixed ?? portfolio.net_profit;
  const totalExpense = total_expense_with_fixed ?? total_expense;
  const fixedCost = fixed_cost_total ?? 0;
  const isPositive = netProfit >= 0;
  const activePeriod = period || SYSTEM_DEFAULT_PERIOD;

  return (
    /* Redesign PR-2: hero gradient + sheen + blur orb + AreaSparkline (görsel). */
    <div
      className="rise sheen rounded-3xl p-6 text-white h-full flex flex-col justify-between relative overflow-hidden"
      style={{ background: "linear-gradient(135deg,#4263eb 0%,#4c6ef5 38%,#6741d9 100%)" }}
    >
      <div className="absolute -right-10 -top-16 w-64 h-64 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />

      {/* Net Profit */}
      <div className="relative mb-1">
        <p className="text-white/70 text-sm font-medium flex items-center gap-2">
          <Wallet size={16} /> Toplam Net Kar
        </p>
        <div className="flex items-baseline gap-3 mt-2">
          <span className="num text-[36px] sm:text-[42px] font-extrabold h-display leading-none">
            {formatCurrency(netProfit)}
          </span>
          <span
            className={`flex items-center gap-1 text-[13px] font-semibold px-2.5 py-1 rounded-full ${
              isPositive
                ? "bg-emerald-400/25 text-emerald-100"
                : "bg-rose-400/25 text-rose-100"
            }`}
          >
            {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {periodLabel(activePeriod)}
          </span>
        </div>
      </div>

      {/* Görsel trend (salt-sunum sparkline). */}
      <div className="relative mt-4">
        <AreaSparkline stroke="#fff" className="w-full h-20" />
      </div>

      {/* Income / Expense Row */}
      <div className="relative grid grid-cols-2 gap-4 pt-5 mt-1 border-t border-white/20">
        <div>
          <p className="text-white/60 text-[11px] font-semibold uppercase tracking-wider">
            Gelir
          </p>
          <p className="num text-xl font-bold mt-0.5">
            {formatCurrency(total_income)}
          </p>
        </div>
        <div>
          <p className="text-white/60 text-[11px] font-semibold uppercase tracking-wider">
            Gider
          </p>
          <p className="num text-xl font-bold mt-0.5">
            {formatCurrency(totalExpense)}
          </p>
          {fixedCost > 0 && (
            <p className="text-white/60 text-[10px] mt-0.5">
              Islem: {formatCurrency(total_expense)} + Sabit: {formatCurrency(fixedCost)}
            </p>
          )}
        </div>
      </div>

      {/* Fixed cost info + business count */}
      <div className="relative flex items-center justify-between mt-4">
        <p className="text-white/60 text-xs">
          {portfolio.business_count} isletme genelinde
        </p>
        {fixedCost > 0 && (
          <div className="flex items-center gap-1 text-white/60 text-[10px]">
            <Pin size={10} />
            <span>Sabit giderler dahil</span>
          </div>
        )}
      </div>
    </div>
  );
}
