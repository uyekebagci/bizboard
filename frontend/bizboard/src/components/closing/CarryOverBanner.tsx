"use client";

/**
 * v1.6.19 (WP-2): "Dünden Kalan Eksik" banner.
 *
 * Önceki günün kapanışındaki fark != 0 ise gösterilir. Eksik → kırmızı,
 * fazla → yeşil. Tıklayınca /kapanislar arşivine gider.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { api } from "@/lib/api/client";
import { formatCurrency, cn } from "@/lib/utils";
import type { CashClosing } from "@/types";

export function CarryOverBanner() {
  const [yesterday, setYesterday] = useState<CashClosing | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<CashClosing>("/closings/yesterday")
      .then((r) => { if (alive) setYesterday(r); })
      .catch(() => { /* No content / err — banner gösterilmez */ });
    return () => { alive = false; };
  }, []);

  if (!yesterday || yesterday.difference == null || yesterday.difference === 0) {
    return null;
  }

  const isMissing = yesterday.difference < 0;
  return (
    <Link
      href="/dashboard/kapanislar"
      className={cn(
        "card flex items-center gap-3 p-3 border transition-colors",
        isMissing
          ? "border-red-500/30 bg-red-500/5 hover:bg-red-500/10"
          : "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10",
      )}
    >
      {isMissing ? (
        <AlertTriangle size={18} className="text-red-400 shrink-0" />
      ) : (
        <TrendingUp size={18} className="text-emerald-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">
          {isMissing ? "Dünden Kalan Eksik" : "Dünden Kalan Fazla"}
        </p>
        <p className="text-[11px] text-surface-400">
          {new Date(yesterday.closing_date).toLocaleDateString("tr-TR", {
            day: "numeric", month: "long",
          })}
          {yesterday.reason_category && <> · {yesterday.reason_category}</>}
        </p>
      </div>
      <span className={cn(
        "text-base font-bold shrink-0",
        isMissing ? "text-red-400" : "text-emerald-400",
      )}>
        {yesterday.difference > 0 ? "+" : ""}{formatCurrency(yesterday.difference, "TRY")}
      </span>
    </Link>
  );
}
