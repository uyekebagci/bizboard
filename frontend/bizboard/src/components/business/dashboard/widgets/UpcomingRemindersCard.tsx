"use client";

// ───────────────────────── 10. YAKLAŞAN HATIRLATMALAR ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)

import { Bell } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";
import { SectionTitle, Footer } from "./shared";

export function UpcomingRemindersCard({ d }: { d: ConsolidatedDashboard }) {
  const list = d.upcoming_reminders;
  if (list.length === 0) {
    return (
      <section className="glass-card p-4">
        <SectionTitle icon={Bell} label="Yaklaşan Hatırlatmalar" />
        <p className="text-xs text-surface-400 py-2">7 gün içinde hatırlatma yok.</p>
      </section>
    );
  }
  return (
    <section className="glass-card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-700">
        <SectionTitle icon={Bell} label="Yaklaşan Hatırlatmalar (7 gün)" inline />
      </div>
      <div className="divide-y divide-surface-700 max-h-72 overflow-y-auto">
        {list.slice(0, 8).map((r) => (
          <div key={r.debt_id} className="px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white truncate">{r.counterpart_name}</p>
              <p className="text-sm font-semibold text-amber-300 shrink-0">
                {formatCurrency(r.amount, "TRY")}
              </p>
            </div>
            <p className="text-[11px] text-surface-400 mt-0.5">
              {new Date(r.reminder_date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
              {" · "}{r.days_to_remind === 0 ? "bugün" : r.days_to_remind > 0 ? `${r.days_to_remind} gün` : `${Math.abs(r.days_to_remind)} gün geçti`}
            </p>
            {r.reminder_note && (
              <p className="text-[11px] text-surface-300 mt-0.5 truncate">{r.reminder_note}</p>
            )}
          </div>
        ))}
      </div>
      <Footer left={`${list.length} hatırlatma`} right="" />
    </section>
  );
}
