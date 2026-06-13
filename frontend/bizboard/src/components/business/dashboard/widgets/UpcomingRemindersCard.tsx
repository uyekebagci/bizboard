"use client";

// ───────────────────────── 10. YAKLAŞAN HATIRLATMALAR ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)
// UI v2 (Daxa) geçiş: tek-tip Widget kabuğu.

import { Bell } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";
import { Widget } from "@/components/v2";
import { Footer } from "./shared";

export function UpcomingRemindersCard({ d }: { d: ConsolidatedDashboard }) {
  const list = d.upcoming_reminders;
  if (list.length === 0) {
    return (
      <Widget title="Yaklaşan Hatırlatmalar" icon={Bell}>
        <p className="text-xs text-[rgb(var(--v2-muted))] py-1">7 gün içinde hatırlatma yok.</p>
      </Widget>
    );
  }
  return (
    <Widget title="Yaklaşan Hatırlatmalar (7 gün)" icon={Bell} flush>
      <div className="divide-y divide-[rgb(var(--v2-border))] max-h-72 overflow-y-auto">
        {list.slice(0, 8).map((r) => (
          <div key={r.debt_id} className="px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-surface-100 truncate">{r.counterpart_name}</p>
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
    </Widget>
  );
}
