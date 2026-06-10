"use client";

import { formatCurrency, cn } from "@/lib/utils";
import type { PortfolioSummary } from "@/types";

interface Props {
  portfolio: PortfolioSummary | null;
}

export function ExpenseChart({ portfolio }: Props) {
  if (!portfolio) return null;

  const { total_income, total_expense, fixed_cost_total } = portfolio;
  const fixedCost = fixed_cost_total ?? 0;
  const totalExpenseAll = total_expense + fixedCost;

  if (totalExpenseAll <= 0 && total_income <= 0) return null;

  const total = total_income + totalExpenseAll;
  const incomePercent = total > 0 ? (total_income / total) * 100 : 0;
  const expensePercent = total > 0 ? (total_expense / total) * 100 : 0;
  const fixedPercent = total > 0 ? (fixedCost / total) * 100 : 0;

  const items = [
    { label: "Gelir", value: total_income, pct: incomePercent, color: "bg-green-500", textColor: "text-green-600" },
    { label: "Islem Gideri", value: total_expense, pct: expensePercent, color: "bg-red-400", textColor: "text-red-600" },
  ];
  if (fixedCost > 0) {
    items.push({ label: "Sabit Gider", value: fixedCost, pct: fixedPercent, color: "bg-orange-400", textColor: "text-orange-600" });
  }

  return (
    <div className="card p-4 flex-1">
      <h3 className="text-sm font-bold text-surface-100 mb-3">Gelir / Gider Dagilimi</h3>

      {/* Bar */}
      <div className="h-4 rounded-full overflow-hidden flex bg-surface-700">
        {items.map((item) => (
          <div
            key={item.label}
            className={cn("h-full transition-all duration-500", item.color)}
            style={{ width: `${item.pct}%` }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              <div className={cn("w-2.5 h-2.5 rounded-full", item.color)} />
              <span className="text-[10px] text-surface-400 font-medium">{item.label}</span>
            </div>
            <p className={cn("text-sm font-bold", item.textColor)}>{formatCurrency(item.value)}</p>
            <p className="text-[10px] text-surface-400">%{item.pct.toFixed(0)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
