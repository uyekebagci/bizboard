"use client";

// ───────────────────────── 9. YAKLAŞAN ÇEKLER ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)

import { CalendarClock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";
import { SectionTitle, Footer } from "./shared";

export function UpcomingChequesCard({ d }: { d: ConsolidatedDashboard }) {
  const list = d.upcoming_cheques;
  if (list.length === 0) {
    return (
      <section className="glass-card p-4">
        <SectionTitle icon={CalendarClock} label="Yaklaşan Çekler" />
        <p className="text-xs text-surface-400 py-2">30 gün içinde çek yok.</p>
      </section>
    );
  }
  const total = list.reduce((a, x) => a + x.amount, 0);
  return (
    <section className="glass-card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-700">
        <SectionTitle icon={CalendarClock} label="Yaklaşan Çekler (30 gün)" inline />
      </div>
      <div className="divide-y divide-surface-700 max-h-72 overflow-y-auto">
        {list.slice(0, 8).map((c) => (
          <div key={c.debt_id} className="px-4 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-surface-100 truncate">{c.counterpart_name}</p>
              <p className="text-[11px] text-surface-400">
                Vade {new Date(c.cheque_due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                {" · "}{c.days_to_due >= 0 ? `${c.days_to_due} gün` : `${Math.abs(c.days_to_due)} gün geçti`}
                {c.collector_bank && <> · {c.collector_bank}</>}
              </p>
            </div>
            <p className="text-sm font-semibold text-purple-300 shrink-0">
              {formatCurrency(c.amount, "TRY")}
            </p>
          </div>
        ))}
      </div>
      <Footer left={`${list.length} çek / 30 gün`} right={`Toplam ${formatCurrency(total, "TRY")}`} />
    </section>
  );
}
