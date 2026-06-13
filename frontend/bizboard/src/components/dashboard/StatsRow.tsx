"use client";

import { TrendingUp, TrendingDown, Wallet, Receipt, Pin, Users, AlertTriangle, Landmark } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { PortfolioSummary } from "@/types";

interface Props {
  portfolio: PortfolioSummary | null;
  debtData: { receivable: number; payable: number } | null;
  employeeData: { count: number; cost: number } | null;
}

export function StatsRow({ portfolio, debtData, employeeData }: Props) {
  if (!portfolio) return null;

  const { total_income, total_expense, fixed_cost_total, net_profit_with_fixed, net_profit } = portfolio;
  const fixedCost = fixed_cost_total ?? 0;
  const netProfit = net_profit_with_fixed ?? net_profit;
  const totalExpenseAll = (total_expense ?? 0) + fixedCost;

  // Kar marjı
  const margin = total_income > 0 ? ((netProfit / total_income) * 100) : 0;

  const stats = [
    {
      label: "Toplam Gelir",
      value: formatCurrency(total_income),
      icon: TrendingUp,
      color: "text-green-400",
      bg: "bg-green-500/15",
      sub: null,
    },
    {
      label: "Toplam Gider",
      value: formatCurrency(totalExpenseAll),
      icon: TrendingDown,
      color: "text-red-400",
      bg: "bg-red-500/15",
      sub: fixedCost > 0 ? `Sabit: ${formatCurrency(fixedCost)}` : null,
    },
    {
      label: "Personel",
      value: employeeData ? `${employeeData.count} kişi` : "—",
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-500/15",
      sub: employeeData && employeeData.cost > 0 ? formatCurrency(employeeData.cost) + "/ay" : null,
    },
    {
      label: "Kâr Marjı",
      value: `%${margin.toFixed(1)}`,
      icon: Landmark,
      color: margin >= 20 ? "text-green-400" : margin >= 0 ? "text-amber-400" : "text-red-400",
      bg: margin >= 20 ? "bg-green-500/15" : margin >= 0 ? "bg-amber-500/15" : "bg-red-500/15",
      sub: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.label} className="card p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", stat.bg)}>
                <Icon size={16} className={stat.color} />
              </div>
              <p className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">{stat.label}</p>
            </div>
            <p className={cn("text-lg font-bold", stat.color)}>{stat.value}</p>
            {stat.sub && <p className="text-[10px] text-surface-400 mt-0.5">{stat.sub}</p>}
          </div>
        );
      })}
    </div>
  );
}
