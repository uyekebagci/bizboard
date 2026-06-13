"use client";

/**
 * Ledger v2 (Faz B, §4 madde 5): kaçak drill-down modal'ı — variance'ın
 * kaynağına in. Hesap-bazlı sapma (hangi hesap saptı) + o günün konum
 * hareketleri (hangi işlem). Portal'lı, çift tema (v2 Daxa).
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Search } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import type { DayCloseDrillDown } from "@/types";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface Props {
  date: string | null;
  load: (date: string) => Promise<DayCloseDrillDown>;
  onClose: () => void;
}

export function DrillDownModal({ date, load, onClose }: Props) {
  const open = !!date;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, dialogRef);

  const [data, setData] = useState<DayCloseDrillDown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) { setData(null); return; }
    setLoading(true);
    setError(null);
    load(date)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err, "Detay yüklenemedi")))
      .finally(() => setLoading(false));
  }, [date, load]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drilldown-modal-title"
    >
      <div ref={dialogRef} className="v2-card shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[rgb(var(--v2-border))]">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-accent-strong dark:text-accent" />
            <h3 id="drilldown-modal-title" className="text-lg font-bold text-[rgb(var(--v2-ink))]">Kaçak Detayı — {date}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-muted))] hover:text-[rgb(var(--v2-ink))]"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={26} className="animate-spin text-[rgb(var(--v2-muted))]" />
            </div>
          )}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-sm">{error}</div>
          )}

          {data && !loading && (
            <>
              {/* Özet */}
              <div className="rounded-2xl p-4 v2-sunken border border-[rgb(var(--v2-border))] grid grid-cols-2 gap-y-1.5 text-sm">
                <span className="text-[rgb(var(--v2-muted))]">Olması Gereken</span>
                <span className="text-right text-[rgb(var(--v2-ink))] font-semibold num">{formatCurrency(data.computed_closing, "TRY")}</span>
                <span className="text-[rgb(var(--v2-muted))]">Son Kasa</span>
                <span className="text-right text-[rgb(var(--v2-ink))] font-semibold num">{formatCurrency(data.actual_total ?? 0, "TRY")}</span>
                <span className="text-[rgb(var(--v2-muted))]">Eksik / Fazla</span>
                <span className={cn(
                  "text-right font-bold num",
                  (data.variance ?? 0) > 0 ? "text-red-700 dark:text-red-400" : (data.variance ?? 0) < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-[rgb(var(--v2-ink))]",
                )}>
                  {(data.variance ?? 0) > 0 ? "+" : ""}{formatCurrency(data.variance ?? 0, "TRY")}
                </span>
              </div>

              {/* Hesap bazlı sapma */}
              <div>
                <p className="label mb-1.5">Hesap Bazlı Sapma</p>
                <div className="v2-card divide-y divide-[rgb(var(--v2-border))]">
                  {data.account_breakdown.length === 0 && (
                    <p className="p-3 text-xs text-[rgb(var(--v2-muted))]">Sayım kaydı yok.</p>
                  )}
                  {data.account_breakdown.map((a) => (
                    <div key={a.account_id} className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-[rgb(var(--v2-ink))] truncate">{a.account_name}</p>
                        <p className="text-[11px] text-[rgb(var(--v2-muted))]">
                          Sayım {formatCurrency(a.counted_balance ?? 0, "TRY")} · Sistem {formatCurrency(a.computed_balance ?? 0, "TRY")}
                        </p>
                      </div>
                      {a.account_variance != null && Math.abs(a.account_variance) > 0.005 && (
                        <span className={cn("text-sm font-semibold shrink-0",
                          a.account_variance < 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>
                          {a.account_variance > 0 ? "+" : ""}{formatCurrency(a.account_variance, "TRY")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Gün hareketleri */}
              <div>
                <p className="label mb-1.5">Gün Hareketleri ({data.movements.length})</p>
                <div className="v2-card divide-y divide-[rgb(var(--v2-border))] max-h-56 overflow-y-auto">
                  {data.movements.length === 0 && (
                    <p className="p-3 text-xs text-[rgb(var(--v2-muted))]">Bu güne ait konum hareketi yok.</p>
                  )}
                  {data.movements.map((m) => (
                    <div key={m.posting_id} className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-[rgb(var(--v2-ink))] truncate">{m.account_name ?? "—"}</p>
                        <p className="text-[11px] text-[rgb(var(--v2-muted))] truncate">
                          {m.source_type}{m.description ? ` · ${m.description}` : ""}
                        </p>
                      </div>
                      <span className={cn("text-sm font-medium shrink-0 num",
                        m.amount < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300")}>
                        {m.amount > 0 ? "+" : ""}{formatCurrency(m.amount, "TRY")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
