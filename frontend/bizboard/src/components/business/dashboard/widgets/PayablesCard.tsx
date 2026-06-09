"use client";

// ───────────────────────── 5. VERECEKLER (PAYABLES) ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)
// Not: v1.6.23.29'dan beri ana panoda render edilmiyor (Konsolide DGR'de
// sub-stat olarak var). Kod ileride tekrar kullanim icin korunuyor.

import { useState } from "react";
import { TrendingDown } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";
import { WidgetDetailModal } from "../WidgetDetailModal";
import { SectionTitle, Footer } from "./shared";

export function PayablesCard({ d }: { d: ConsolidatedDashboard }) {
  // v1.6.23.16 (TODO d0ccb7f0 expansion): tıkla → modal
  const [showDetail, setShowDetail] = useState(false);
  const list = d.payables;
  if (list.length === 0) {
    return (
      <section className="glass-card p-4">
        <SectionTitle icon={TrendingDown} label="Verecekler" />
        <p className="text-xs text-surface-400 py-2">Açık veriniz yok.</p>
      </section>
    );
  }
  const total = list.reduce((a, x) => a + x.amount, 0);
  const within7d = list.filter((x) => x.days_to_due != null && x.days_to_due <= 7 && x.days_to_due >= 0);
  const within7dTotal = within7d.reduce((a, x) => a + x.amount, 0);
  // v1.6.23.8 (DGR perspective): Verecekler DGR'den gidecek para — minus sign göster.
  // Backend amount magnitude döner (positive); display layer'da negatife çeviriyoruz.
  return (
    <>
    <section
      onClick={() => setShowDetail(true)}
      className="glass-card glass-hover overflow-hidden cursor-pointer hover:ring-1 hover:ring-red-500/40 transition-all"
    >
      <div className="px-4 py-3 border-b border-surface-700">
        <SectionTitle icon={TrendingDown} label="Verecekler" inline />
      </div>
      <div className="divide-y divide-surface-700 max-h-72 overflow-y-auto">
        {list.slice(0, 8).map((p) => {
          const soon = p.days_to_due != null && p.days_to_due <= 7 && p.days_to_due >= 0;
          return (
            <div key={p.debt_id} className={cn(
              "px-4 py-2.5 flex items-center justify-between gap-3",
              soon && "bg-amber-500/5",
            )}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{p.counterpart_name}</p>
                <p className="text-[11px] text-surface-400">
                  {p.instrument_type || "—"}
                  {p.due_date && (
                    <> · Vade {new Date(p.due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</>
                  )}
                </p>
              </div>
              <p className={cn("text-sm font-semibold shrink-0", soon ? "text-amber-300" : "text-red-300")}>
                −{formatCurrency(p.amount, p.currency || "TRY")}
              </p>
            </div>
          );
        })}
      </div>
      <Footer
        left={`${list.length} verecek`}
        right={
          <span className="text-red-300">
            Toplam −{formatCurrency(total, "TRY")}
            {within7d.length > 0 && (
              <span className="ml-1.5 text-amber-300">· 7 gün: −{formatCurrency(within7dTotal, "TRY")}</span>
            )}
          </span>
        }
      />
    </section>
    <WidgetDetailModal
      open={showDetail}
      onClose={() => setShowDetail(false)}
      title="Verecekler — Detay"
      subtitle={`${list.length} satır · toplam −${formatCurrency(total, "TRY")}`}
      size="md"
    >
      <div className="space-y-2">
        {list.map((p) => {
          const soon = p.days_to_due != null && p.days_to_due <= 7 && p.days_to_due >= 0;
          return (
            <div
              key={p.debt_id}
              className={cn(
                "flex items-center justify-between gap-3 p-3 rounded-lg border",
                soon ? "border-amber-500/40 bg-amber-500/5" : "border-surface-700",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{p.counterpart_name}</p>
                <p className="text-[11px] text-surface-400">
                  {p.instrument_type || "—"}
                  {p.due_date && (
                    <> · Vade {new Date(p.due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</>
                  )}
                  {p.days_to_due != null && (
                    <span className={soon ? "ml-1.5 text-amber-300" : "ml-1.5 text-surface-500"}>
                      ({p.days_to_due >= 0 ? `${p.days_to_due} gün` : `${Math.abs(p.days_to_due)} gün geçti`})
                    </span>
                  )}
                </p>
              </div>
              <p className={cn("text-sm font-semibold shrink-0", soon ? "text-amber-300" : "text-red-300")}>
                −{formatCurrency(p.amount, p.currency || "TRY")}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-surface-700 flex items-center justify-between text-sm">
        <span className="text-surface-300">Toplam</span>
        <span className="font-bold text-red-300">−{formatCurrency(total, "TRY")}</span>
      </div>
    </WidgetDetailModal>
    </>
  );
}
