"use client";

// ───────────────────────── 8. HESAPTAN HARCAMA (BUGÜN) ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)
// UI v2 (Daxa) geçiş: tek-tip Widget kabuğu. Liste + Footer body'de (flush);
// kabuk/yüzey global'den gelir.

import { Banknote } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";
import { Widget } from "@/components/v2";
import { Footer } from "./shared";

export function CashOutflowsTodayCard({ d }: { d: ConsolidatedDashboard }) {
  const list = d.cash_outflows_today;
  if (list.length === 0) {
    return (
      <Widget title="Hesaptan Harcama (Bugün)" icon={Banknote}>
        <p className="text-xs text-[rgb(var(--v2-muted))] py-1">Bugün nakit harcama yok.</p>
      </Widget>
    );
  }
  const total = list.reduce((a, x) => a + x.amount, 0);
  return (
    <Widget title="Hesaptan Harcama (Bugün)" icon={Banknote} flush>
      <div className="divide-y divide-[rgb(var(--v2-border))] max-h-72 overflow-y-auto">
        {list.slice(0, 10).map((t) => (
          <div key={t.tx_id} className="px-4 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-surface-100 truncate">
                {t.description || t.category_name || "Harcama"}
              </p>
              <p className="text-[11px] text-surface-400 truncate">
                {t.counterpart_name || t.category_name || "—"}
              </p>
            </div>
            <p className="text-sm font-semibold text-red-300 shrink-0">
              -{formatCurrency(t.amount, "TRY")}
            </p>
          </div>
        ))}
      </div>
      <Footer left={`${list.length} harcama`} right={`Toplam -${formatCurrency(total, "TRY")}`} />
    </Widget>
  );
}
