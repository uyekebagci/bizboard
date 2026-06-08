"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
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
    return <div className="glass-card p-4 h-28 animate-pulse" />;
  }

  const net = totals.receivable - totals.payable;
  const hasData = totals.receivable > 0 || totals.payable > 0;

  if (!hasData) return null;

  return (
    /* Redesign PR-2: glass + token-correct renkler (light+dark). */
    <div className="glass-card p-5 flex-1">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-xl bg-violet-500/15 grid place-items-center">
          <Scale size={18} className="text-violet-400" />
        </div>
        <h3 className="text-[15px] font-bold h-display text-white">Borc / Alacak Durumu</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Alacak */}
        <div className="rounded-2xl p-4 bg-emerald-500/8 border border-emerald-500/15">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDownLeft size={14} className="text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Alacak</span>
          </div>
          <p className="num text-2xl font-bold text-emerald-300">{formatCurrency(totals.receivable)}</p>
          <p className="text-[11px] text-surface-400 mt-1">{totals.rCount} kayit</p>
        </div>

        {/* Borç */}
        <div className="rounded-2xl p-4 bg-rose-500/8 border border-rose-500/15">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowUpRight size={14} className="text-rose-400" />
            <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">Borc</span>
          </div>
          <p className="num text-2xl font-bold text-rose-300">{formatCurrency(totals.payable)}</p>
          <p className="text-[11px] text-surface-400 mt-1">{totals.pCount} kayit</p>
        </div>
      </div>

      {/* Net bakiye */}
      <div className="mt-4 pt-4 border-t border-surface-700/60 flex items-center justify-between">
        <span className="text-[13px] text-surface-400">Net Bakiye</span>
        <span className={cn("num text-lg font-bold", net >= 0 ? "text-emerald-300" : "text-rose-300")}>
          {net >= 0 ? "+" : ""}{formatCurrency(net)}
        </span>
      </div>
    </div>
  );
}
