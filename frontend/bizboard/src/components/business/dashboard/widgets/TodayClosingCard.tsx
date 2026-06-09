"use client";

// ───────────────────────── 2. BUGÜNÜN KASA DURUMU ─────────────────────────
// (R3 god-component bolme: ConsolidatedWidgets.tsx'ten cikarildi)

import { useState } from "react";
import { CalendarClock, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConsolidatedDashboard } from "@/types";
import { WidgetDetailModal } from "../WidgetDetailModal";
import { Stat, DetailRow } from "./shared";

export function TodayClosingCard({ d, onCloseDay }: { d: ConsolidatedDashboard; onCloseDay?: () => void }) {
  const t = d.today_closing;
  // v1.6.23.15 (TODO d0ccb7f0): tıklanabilir → detay modal
  const [showDetail, setShowDetail] = useState(false);
  return (
    <>
    <section
      onClick={(e) => {
        // "Günü Kapat" butonuna tıklanmışsa modal açma
        const target = e.target as HTMLElement;
        if (target.closest("button")) return;
        setShowDetail(true);
      }}
      className={cn(
      "card p-4 border cursor-pointer hover:ring-1 transition-all",
      t.closed
        ? "border-emerald-500/20 bg-emerald-500/5 hover:ring-emerald-500/40"
        : "border-amber-500/30 bg-amber-500/5 hover:ring-amber-500/40",
    )}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
          {t.closed ? <Lock size={14} className="text-emerald-400" /> : <CalendarClock size={14} className="text-amber-400" />}
          Bugünün Kasa Durumu
        </h3>
        {t.is_auto && (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface-700 text-surface-300 border border-surface-600">OTO</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Açılış" value={t.opening_balance} />
        <Stat label="Hesaplanan" value={t.computed_closing} bold />
        <Stat label="Gelen" value={t.incoming} tone="positive" />
        <Stat label="Giden" value={-t.outgoing} tone="negative" />
        {t.actual_balance != null && (
          <>
            <Stat label="Sayım" value={t.actual_balance} />
            {t.difference != null && t.difference !== 0 && (
              <Stat
                label="Fark"
                value={t.difference}
                tone={t.difference < 0 ? "negative" : "positive"}
              />
            )}
          </>
        )}
      </div>

      {!t.closed && onCloseDay && (
        // v1.6.23.13 (TODO ca443172): yanlış basılma riskini azaltmak için
        // küçük + secondary stil — modal zaten confirm görevi görüyor.
        <div className="mt-3 flex justify-end">
          <button
            onClick={onCloseDay}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
            title="Günü kapat — fiziksel sayım modal'ı açılır"
          >
            Günü Kapat
          </button>
        </div>
      )}
    </section>
    {/* v1.6.23.15 (TODO d0ccb7f0): Bugünün kasa detayı modal */}
    <WidgetDetailModal
      open={showDetail}
      onClose={() => setShowDetail(false)}
      title="Bugünün Kasa Durumu — Detay"
      subtitle={t.closed ? "Kapanmış (final)" : "Açık (gün içi)"}
      size="md"
    >
      <div className="space-y-3 text-sm text-surface-200">
        <DetailRow label="Açılış Bakiyesi" value={t.opening_balance} tone="neutral" />
        <DetailRow label="Bugün Gelen (NAKIT in)" value={t.incoming} tone="pos" />
        <DetailRow label="Bugün Giden (NAKIT out)" value={-Math.abs(t.outgoing)} tone="neg" />
        <div className="pt-2 border-t border-surface-700">
          <DetailRow
            label="Hesaplanan Kapanış"
            value={t.computed_closing}
            tone="neutral"
            bold
          />
          {t.actual_balance != null && (
            <>
              <DetailRow label="Fiziksel Sayım" value={t.actual_balance} tone="neutral" bold />
              {t.difference != null && t.difference !== 0 && (
                <DetailRow
                  label="Fark (sayım − hesap)"
                  value={t.difference}
                  tone={t.difference < 0 ? "neg" : "pos"}
                />
              )}
            </>
          )}
        </div>
        <p className="text-[11px] text-surface-400 pt-2">
          Formül: opening_balance + NAKIT income − NAKIT expense = computed_closing.
          Fiziksel sayım girilince fark hesaplanır.
        </p>
      </div>
    </WidgetDetailModal>
    </>
  );
}
