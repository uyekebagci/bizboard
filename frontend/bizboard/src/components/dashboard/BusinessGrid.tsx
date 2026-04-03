"use client";

import { useRouter } from "next/navigation";
import {
  HardHat, Truck, UtensilsCrossed, Car, Store, Home,
  Briefcase, LayoutGrid, Plus, TrendingUp, TrendingDown, Pin,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatCurrency, statusColor, getBusinessStatus, cn } from "@/lib/utils";
import type { Business, PortfolioSummary } from "@/types";

const iconMap: Record<string, LucideIcon> = {
  "hard-hat": HardHat,
  truck: Truck,
  "utensils-crossed": UtensilsCrossed,
  car: Car,
  store: Store,
  home: Home,
  briefcase: Briefcase,
  "layout-grid": LayoutGrid,
};

interface Props {
  businesses: Business[];
  portfolio?: PortfolioSummary | null;
}

export function BusinessGrid({ businesses, portfolio }: Props) {
  const router = useRouter();

  // Portfolio verilerinden iş bazlı lookup
  const bizDataMap: Record<string, { income: number; expense: number; profit: number; fixed_cost: number }> = {};
  if (portfolio?.businesses) {
    for (const b of portfolio.businesses) {
      bizDataMap[b.business_id] = b;
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {businesses.map((biz) => {
        const Icon = iconMap[biz.business_type?.icon || "layout-grid"] || LayoutGrid;
        const color = biz.color || biz.business_type?.color || "#4c6ef5";
        const data = bizDataMap[biz.id];
        const income = data?.income ?? 0;
        const expense = data?.expense ?? 0;
        const fixedCost = data?.fixed_cost ?? 0;
        const netProfit = (data?.profit ?? 0) - fixedCost;
        const status = getBusinessStatus({ netProfit, trend: 0 });
        const sc = statusColor(status);

        return (
          <button
            key={biz.id}
            onClick={() => router.push(`/business/${biz.id}`)}
            className="card p-4 text-left hover:shadow-card-hover transition-all duration-200 active:scale-[0.98]"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${color}15` }}
                >
                  <Icon size={20} style={{ color }} />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm leading-tight truncate">
                    {biz.name}
                  </h3>
                  <p className="text-[11px] text-surface-400 capitalize">
                    {biz.business_type?.label || "Isletme"}
                  </p>
                </div>
              </div>
              <span className={cn("status-dot mt-1", sc.dot)} />
            </div>

            {/* Gelir / Gider satırı */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <div className="flex items-center gap-1 mb-0.5">
                  <TrendingUp size={10} className="text-green-500" />
                  <span className="text-[10px] text-green-400 font-medium">Gelir</span>
                </div>
                <p className="text-xs font-bold text-green-400">{formatCurrency(income)}</p>
              </div>
              <div className="p-2 bg-red-500/10 rounded-lg">
                <div className="flex items-center gap-1 mb-0.5">
                  <TrendingDown size={10} className="text-red-500" />
                  <span className="text-[10px] text-red-400 font-medium">Gider</span>
                </div>
                <p className="text-xs font-bold text-red-400">{formatCurrency(expense + fixedCost)}</p>
              </div>
            </div>

            {/* Net Kar */}
            <div className="mt-2 pt-2 border-t border-surface-700 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-surface-400">Net Kar</span>
                {fixedCost > 0 && <Pin size={8} className="text-surface-400" />}
              </div>
              <p className={cn(
                "text-sm font-bold",
                netProfit > 0 ? "text-green-600" : netProfit < 0 ? "text-red-600" : "text-white"
              )}>
                {formatCurrency(netProfit, biz.currency)}
              </p>
            </div>
          </button>
        );
      })}

      {/* Isletme Ekle */}
      <button
        onClick={() => router.push("/dashboard/add")}
        className="card p-4 flex flex-col items-center justify-center gap-2
                   border-2 border-dashed border-surface-600 hover:border-brand-400
                   hover:bg-brand-50 transition-all duration-200 min-h-[140px]"
      >
        <Plus size={24} className="text-surface-400" />
        <span className="text-sm font-medium text-surface-400">
          Isletme Ekle
        </span>
      </button>
    </div>
  );
}
