"use client";

import { TrendingUp, TrendingDown, Pin } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { periodLabel, SYSTEM_DEFAULT_PERIOD, type Period } from "@/lib/preferences";
import type { PortfolioSummary } from "@/types";

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
    <div className="card p-5 bg-gradient-to-br from-brand-600 to-brand-800 text-white h-full flex flex-col justify-between">
      {/* Net Profit */}
      <div className="mb-4">
        <p className="text-brand-200 text-sm font-medium">Toplam Net Kar</p>
        <div className="flex items-baseline gap-3 mt-1">
          <span className="text-3xl font-bold tracking-tight">
            {formatCurrency(netProfit)}
          </span>
          <span
            className={`flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-full ${
              isPositive
                ? "bg-green-500/20 text-green-200"
                : "bg-red-500/20 text-red-200"
            }`}
          >
            {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {periodLabel(activePeriod)}
          </span>
        </div>
      </div>

      {/* Income / Expense Row */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/20">
        <div>
          <p className="text-brand-200 text-xs font-medium uppercase tracking-wide">
            Gelir
          </p>
          <p className="text-xl font-bold mt-0.5">
            {formatCurrency(total_income)}
          </p>
        </div>
        <div>
          <p className="text-brand-200 text-xs font-medium uppercase tracking-wide">
            Gider
          </p>
          <p className="text-xl font-bold mt-0.5">
            {formatCurrency(totalExpense)}
          </p>
          {fixedCost > 0 && (
            <p className="text-brand-300 text-[10px] mt-0.5">
              Islem: {formatCurrency(total_expense)} + Sabit: {formatCurrency(fixedCost)}
            </p>
          )}
        </div>
      </div>

      {/* Fixed cost info + business count */}
      <div className="flex items-center justify-between mt-4">
        <p className="text-brand-200 text-xs">
          {portfolio.business_count} isletme genelinde
        </p>
        {fixedCost > 0 && (
          <div className="flex items-center gap-1 text-brand-300 text-[10px]">
            <Pin size={10} />
            <span>Sabit giderler dahil</span>
          </div>
        )}
      </div>
    </div>
  );
}
