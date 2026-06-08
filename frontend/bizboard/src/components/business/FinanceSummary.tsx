"use client";

import { TrendingUp, TrendingDown, Wallet, Pin } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { PeriodSummary } from "@/types";

interface Props {
  summary: PeriodSummary | null;
  currency: string;
}

export function FinanceSummary({ summary, currency }: Props) {
  const income = summary?.total_income ?? 0;
  const expense = summary?.total_expense ?? 0;
  const fixedCost = summary?.fixed_cost_total ?? 0;
  const totalExpense = summary?.total_expense_with_fixed ?? expense;
  const profit = summary?.net_profit_with_fixed ?? (income - totalExpense);

  return (
    <div className="space-y-2">
      {/* Ana kartlar */}
      {/* Redesign Inc.2: glass + token-correct ikon renkleri + .num. */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/15">
              <TrendingUp size={14} className="text-emerald-400" />
            </div>
          </div>
          <p className="text-[11px] text-surface-400 font-medium uppercase tracking-wide">Gelir</p>
          <p className="num text-base font-bold text-white mt-0.5 truncate">
            {formatCurrency(income, currency)}
          </p>
        </div>

        <div className="glass-card p-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-rose-500/15">
              <TrendingDown size={14} className="text-rose-400" />
            </div>
          </div>
          <p className="text-[11px] text-surface-400 font-medium uppercase tracking-wide">Gider</p>
          <p className="num text-base font-bold text-white mt-0.5 truncate">
            {formatCurrency(totalExpense, currency)}
          </p>
          {fixedCost > 0 && (
            <p className="text-[10px] text-surface-400 mt-0.5 truncate">
              Islem: {formatCurrency(expense, currency)} + Sabit: {formatCurrency(fixedCost, currency)}
            </p>
          )}
        </div>

        <div className="glass-card p-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <div className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center",
              profit >= 0 ? "bg-brand-500/15" : "bg-rose-500/15"
            )}>
              <Wallet size={14} className={profit >= 0 ? "text-brand-400" : "text-rose-400"} />
            </div>
          </div>
          <p className="text-[11px] text-surface-400 font-medium uppercase tracking-wide">Kar</p>
          <p className={cn(
            "num text-base font-bold mt-0.5 truncate",
            profit >= 0 ? "text-white" : "text-rose-300"
          )}>
            {formatCurrency(profit, currency)}
          </p>
        </div>
      </div>

      {/* Sabit gider detayı */}
      {fixedCost > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <Pin size={12} className="text-amber-600 shrink-0" />
          <p className="text-[11px] text-amber-400">
            <span className="font-medium">Sabit Giderler:</span>{" "}
            {formatCurrency(fixedCost, currency)} (bu doneme oranlanmis)
          </p>
        </div>
      )}
    </div>
  );
}
