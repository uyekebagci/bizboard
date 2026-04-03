"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Scale, ChevronRight } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import type { Business } from "@/types";

interface DebtSummary {
  total_receivable: number;
  total_payable: number;
  net_balance: number;
  receivable_count: number;
  payable_count: number;
  pending_receivable: number;
  pending_payable: number;
}

interface Props {
  businesses: Business[];
  onTotalChange?: (data: { receivable: number; payable: number }) => void;
}

export function DebtWidget({ businesses, onTotalChange }: Props) {
  const [totals, setTotals] = useState({ receivable: 0, payable: 0, rCount: 0, pCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const results = await Promise.all(
          businesses.map((b) =>
            api.get<DebtSummary>(`/businesses/${b.id}/debts/summary`).catch(() => null)
          )
        );
        let receivable = 0, payable = 0, rCount = 0, pCount = 0;
        for (const r of results) {
          if (r) {
            receivable += r.pending_receivable || 0;
            payable += r.pending_payable || 0;
            rCount += r.receivable_count || 0;
            pCount += r.payable_count || 0;
          }
        }
        setTotals({ receivable, payable, rCount, pCount });
        onTotalChange?.({ receivable, payable });
      } catch { }
      finally { setLoading(false); }
    }
    if (businesses.length > 0) fetchAll();
    else setLoading(false);
  }, [businesses]);

  if (loading) {
    return <div className="card p-4 h-28 animate-pulse bg-surface-700 rounded-2xl" />;
  }

  const net = totals.receivable - totals.payable;
  const hasData = totals.receivable > 0 || totals.payable > 0;

  if (!hasData) return null;

  return (
    <div className="card p-4 flex-1">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
          <Scale size={16} className="text-violet-600" />
        </div>
        <h3 className="text-sm font-bold text-white">Borc / Alacak Durumu</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Alacak */}
        <div className="p-3 bg-green-50/60 rounded-xl">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDownLeft size={12} className="text-green-600" />
            <span className="text-[10px] font-medium text-green-700 uppercase tracking-wider">Alacak</span>
          </div>
          <p className="text-lg font-bold text-green-700">{formatCurrency(totals.receivable)}</p>
          <p className="text-[10px] text-green-600/70 mt-0.5">{totals.rCount} kayit</p>
        </div>

        {/* Borç */}
        <div className="p-3 bg-red-50/60 rounded-xl">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowUpRight size={12} className="text-red-600" />
            <span className="text-[10px] font-medium text-red-700 uppercase tracking-wider">Borc</span>
          </div>
          <p className="text-lg font-bold text-red-700">{formatCurrency(totals.payable)}</p>
          <p className="text-[10px] text-red-600/70 mt-0.5">{totals.pCount} kayit</p>
        </div>
      </div>

      {/* Net bakiye */}
      <div className="mt-3 pt-3 border-t border-surface-700 flex items-center justify-between">
        <span className="text-xs text-surface-400">Net Bakiye</span>
        <span className={cn("text-sm font-bold", net >= 0 ? "text-green-600" : "text-red-600")}>
          {net >= 0 ? "+" : ""}{formatCurrency(net)}
        </span>
      </div>
    </div>
  );
}
